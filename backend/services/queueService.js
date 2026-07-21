import * as dbService from "./dbService.js";
import { v4 as uuidv4 } from "uuid";

class QueueService {
    constructor() {
        this.pollingInterval = 2000; // Poll every 2 seconds
        this.pollTimer = null;
        this.isProcessing = false;

        // Simple concurrency locks per type
        this.activeJobs = {
            SANDBOX: 0,
            COMFYUI: 0,
            OCR: 0
        };

        // User requested concurrency defaults: GPU tasks = 1, Sandbox = 2
        this.concurrencyLimits = {
            SANDBOX: 2,
            COMFYUI: 1,
            OCR: 1
        };

        // Handlers for job types
        this.handlers = {};
    }

    /**
     * Register a handler function for a job type.
     * @param {string} type 
     * @param {Function} handler async (payload) => result
     */
    registerHandler(type, handler) {
        this.handlers[type] = handler;
    }

    /**
     * Start the background queue processor.
     */
    start() {
        if (!this.pollTimer) {
            console.log("📥 QUEUE_SERVICE: Starting job queue processor...");
            this.pollTimer = setInterval(() => this.processQueue(), this.pollingInterval);
        }
    }

    /**
     * Stop the background queue processor.
     */
    stop() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * Enqueue a new job.
     */
    async enqueue(type, payload, maxRetries = 3) {
        const jobId = uuidv4();
        await dbService.runQuery(
            `INSERT INTO Jobs (id, type, payload_json, status, max_retries) VALUES (?, ?, ?, 'PENDING', ?)`,
            [jobId, type, JSON.stringify(payload), maxRetries]
        );
        return jobId;
    }

    /**
     * Get status of a job.
     */
    async getStatus(jobId) {
        const rows = await dbService.runQuery(`SELECT * FROM Jobs WHERE id = ?`, [jobId]);
        if (rows.length === 0) return null;
        return rows[0];
    }

    /**
     * Cancel a job (if pending).
     */
    async cancel(jobId) {
        await dbService.runQuery(
            `UPDATE Jobs SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status IN ('PENDING', 'RUNNING')`,
            [jobId]
        );
    }

    /**
     * Core polling logic.
     */
    async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            // Find types that are under their concurrency limit
            for (const type of Object.keys(this.handlers)) {
                if (this.activeJobs[type] >= (this.concurrencyLimits[type] || 1)) {
                    continue; // At capacity
                }

                // Fetch next PENDING job of this type (FIFO)
                // Use a transaction or optimistic lock to claim it
                const pending = await dbService.runQuery(
                    `SELECT * FROM Jobs WHERE type = ? AND status = 'PENDING' ORDER BY created_at ASC LIMIT 1`,
                    [type]
                );

                if (pending.length > 0) {
                    const job = pending[0];
                    // Attempt to claim
                    const res = await dbService.runQuery(
                        `UPDATE Jobs SET status = 'RUNNING', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'PENDING'`,
                        [job.id]
                    );

                    if (res.changes > 0) {
                        // Successfully claimed, start background execution
                        this.executeJob(job).catch(console.error);
                    }
                }
            }
        } catch (e) {
            console.error("Queue Processing Error:", e);
        } finally {
            this.isProcessing = false;
        }
    }

    async executeJob(job) {
        this.activeJobs[job.type]++;
        try {
            const handler = this.handlers[job.type];
            if (!handler) throw new Error(`No handler registered for job type ${job.type}`);

            const payload = JSON.parse(job.payload_json);
            
            // Execute actual handler
            const result = await handler(payload);

            // Mark completed
            await dbService.runQuery(
                `UPDATE Jobs SET status = 'COMPLETED', result_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                [JSON.stringify(result), job.id]
            );

        } catch (error) {
            console.error(`Job ${job.id} failed:`, error);
            
            // Retry logic
            const currentRetries = job.retries + 1;
            if (currentRetries <= job.max_retries) {
                await dbService.runQuery(
                    `UPDATE Jobs SET status = 'PENDING', retries = ?, error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [currentRetries, error.message, job.id]
                );
            } else {
                // Hard fail
                await dbService.runQuery(
                    `UPDATE Jobs SET status = 'FAILED', retries = ?, error_msg = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    [currentRetries, error.message, job.id]
                );
            }
        } finally {
            this.activeJobs[job.type]--;
        }
    }
}

export default new QueueService();
