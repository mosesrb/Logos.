import sqlite3 from 'sqlite3';
const db = new sqlite3.Database('backend/database/logos.db');
db.all("SELECT * FROM migrations", (err, rows) => {
    console.log(rows);
});
