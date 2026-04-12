import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

export function encrypt(text, password) {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

export function decrypt(encryptedData, password) {
    const parts = encryptedData.split(':');
    const salt = Buffer.from(parts.shift(), 'hex');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const key = crypto.scryptSync(password, salt, 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
