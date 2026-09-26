const Database =
    require("better-sqlite3");


const db =
    new Database(
        process.env.DATABASE_PATH ||
        "feuerwehr.db"
    );


db.pragma(
    "journal_mode = WAL"
);


db.exec(`

    CREATE TABLE IF NOT EXISTS pruefungen (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        titel TEXT NOT NULL,

        typ TEXT,

        material TEXT,

        fragen TEXT NOT NULL,

        zeitlimit INTEGER DEFAULT 30,

        bestehensgrenze INTEGER DEFAULT 70,

        code TEXT UNIQUE NOT NULL,

        erstellt_am TEXT NOT NULL

    );


    CREATE TABLE IF NOT EXISTS teilnehmer (

        id INTEGER PRIMARY KEY AUTOINCREMENT,

        pruefung_id INTEGER NOT NULL,

        vorname TEXT NOT NULL,

        nachname TEXT NOT NULL,

        feuerwehr TEXT NOT NULL,

        antworten TEXT NOT NULL,

        punkte REAL DEFAULT 0,

        max_punkte REAL DEFAULT 0,

        prozent REAL DEFAULT 0,

        bestanden INTEGER DEFAULT 0,

        abgegeben_am TEXT NOT NULL,

        FOREIGN KEY (
            pruefung_id
        )
        REFERENCES pruefungen(id)

    );

`);


module.exports = db;
