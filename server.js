require("dotenv").config();


const express =
    require("express");


const cors =
    require("cors");


const crypto =
    require("crypto");


const OpenAI =
    require("openai");


const db =
    require("./database");


const app =
    express();


const PORT =
    process.env.PORT || 3000;


const FRONTEND_URL =
    process.env.FRONTEND_URL || "*";


if (!process.env.OPENAI_API_KEY) {

    console.warn(
        "WARNUNG: OPENAI_API_KEY fehlt."
    );

}


const openai =
    new OpenAI({

        apiKey:
            process.env.OPENAI_API_KEY

    });


app.use(
    cors({

        origin:
            FRONTEND_URL === "*"
                ? true
                : FRONTEND_URL,

        methods: [
            "GET",
            "POST"
        ],

        allowedHeaders: [
            "Content-Type"
        ]

    })
);


app.use(
    express.json({
        limit: "10mb"
    })
);


app.get(
    "/",
    (req, res) => {

        res.json({

            status: "online",

            name:
                "Feuerwehr Prüfungsplattform",

            version:
                "1.0.0"

        });

    }
);


app.get(
    "/api/gesundheit",
    (req, res) => {

        res.json({
            ok: true
        });

    }
);


/*
========================================================
HILFSFUNKTIONEN
========================================================
*/


function generateCode() {

    let code;

    do {

        code =
            crypto
                .randomBytes(4)
                .toString("hex")
                .toUpperCase();

        const existing =
            db.prepare(
                "SELECT id FROM pruefungen WHERE code = ?"
            )
            .get(code);

        if (!existing) {
            break;
        }

    } while (true);


    return code;

}


function cleanQuestions(
    questions
) {

    if (!Array.isArray(questions)) {

        throw new Error(
            "KI hat keine gültigen Fragen geliefert."
        );

    }


    return questions.map(
        (q, index) => {

            if (
                !q.question ||
                !q.type
            ) {

                throw new Error(
                    `Frage ${index + 1} ist ungültig.`
                );

            }


            const allowedTypes = [
                "multiple",
                "truefalse",
                "text"
            ];


            if (
                !allowedTypes.includes(
                    q.type
                )
            ) {

                throw new Error(
                    `Ungültiger Fragetyp bei Frage ${index + 1}.`
                );

            }


            if (
                q.type === "multiple"
            ) {

                if (
                    !Array.isArray(q.options) ||
                    q.options.length < 2
                ) {

                    throw new Error(
                        `Frage ${index + 1} hat keine gültigen Antwortmöglichkeiten.`
                    );

                }


                if (
                    typeof q.correctAnswer !==
                    "number"
                ) {

                    throw new Error(
                        `Frage ${index + 1} hat keine richtige Antwort.`
                    );

                }

            }


            if (
                q.type === "truefalse"
            ) {

                if (
                    typeof q.correctAnswer !==
                    "boolean"
                ) {

                    throw new Error(
                        `Frage ${index + 1} hat keine richtige Antwort.`
                    );

                }

            }


            if (
                q.type === "text"
            ) {

                if (
                    !Array.isArray(
                        q.keywords
                    )
                ) {

                    q.keywords = [];

                }

            }


            return {

                id:
                    index + 1,

                question:
                    String(
                        q.question
                    ).trim(),

                type:
                    q.type,

                options:
                    Array.isArray(
                        q.options
                    )
                        ? q.options
                        : [],

                correctAnswer:
                    q.correctAnswer,

                keywords:
                    Array.isArray(
                        q.keywords
                    )
                        ? q.keywords
                        : [],

                points:
                    Number(
                        q.points || 1
                    )

            };

        }
    );

}


/*
========================================================
KI PRÜFUNG ERSTELLEN
========================================================
*/


app.post(
    "/api/ki/pruefung",
    async (req, res) => {

        try {

            const {

                typ,

                material,

                titel,

                anzahl,

                schwierigkeit,

                grenze,

                zeit

            } = req.body;


            if (!material ||
                material.trim().length < 50
            ) {

                return res.status(400)
                    .json({

                        error:
                            "Das Unterrichtsmaterial ist zu kurz."

                    });

            }


            if (!process.env.OPENAI_API_KEY) {

                return res.status(500)
                    .json({

                        error:
                            "OPENAI_API_KEY ist auf dem Server nicht eingerichtet."

                    });

            }


            const number =
                Math.min(
                    Math.max(
                        Number(anzahl) || 20,
                        1
                    ),
                    100
                );


            const prompt = `

Du bist ein professioneller Assistent
für die Erstellung von Feuerwehr-Prüfungen.

Erstelle eine Prüfung ausschließlich auf
Grundlage des vom Prüfer bereitgestellten
Unterrichtsmaterials.

WICHTIG:

- Keine erfundenen Fakten.
- Keine Informationen verwenden, die nicht
  aus dem Material ableitbar sind.
- Fragen müssen eindeutig sein.
- Jede Frage braucht eine korrekte Lösung.
- Erstelle genau ${number} Fragen.
- Schwierigkeit: ${schwierigkeit || "Mittel"}.
- Prüfungsthema: ${typ || "Eigene Prüfung"}.

Erlaubte Fragetypen:

multiple
truefalse
text

Bei multiple:

options muss ein Array sein.
correctAnswer ist der Index der richtigen Antwort,
beginnend bei 0.

Bei truefalse:

correctAnswer ist true oder false.

Bei text:

keywords enthält wichtige Begriffe, die bei einer
automatischen Vorbewertung berücksichtigt werden.

Jede Frage erhält Punkte.

Antworte ausschließlich als gültiges JSON.

JSON-Struktur:

{
  "questions": [
    {
      "question": "Frage",
      "type": "multiple",
      "options": [
        "Antwort A",
        "Antwort B",
        "Antwort C",
        "Antwort D"
      ],
      "correctAnswer": 0,
      "keywords": [],
      "points": 1
    }
  ]
}

UNTERRICHTSMATERIAL:

${material}

`;


            const response =
                await openai.responses.create({

                    model:
                        process.env.OPENAI_MODEL ||
                        "gpt-5",

                    input:
                        prompt,

                    text: {
                        format: {
                            type:
                                "json_object"
                        }
                    }

                });


            const output =
                response.output_text;


            if (!output) {

                throw new Error(
                    "Die KI hat keine Antwort geliefert."
                );

            }


            let parsed;

            try {

                parsed =
                    JSON.parse(
                        output
                    );

            } catch {

                throw new Error(
                    "Die KI-Antwort war kein gültiges JSON."
                );

            }


            const questions =
                cleanQuestions(
                    parsed.questions
                );


            if (
                questions.length !== number
            ) {

                throw new Error(
                    `Die KI hat ${questions.length} statt ${number} Fragen erstellt.`
                );

            }


            const code =
                generateCode();


            const created =
                new Date()
                    .toISOString();


            const insert =
                db.prepare(`

                    INSERT INTO pruefungen (

                        titel,
                        typ,
                        material,
                        fragen,
                        zeitlimit,
                        bestehensgrenze,
                        code,
                        erstellt_am

                    )

                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)

                `);


            const result =
                insert.run(

                    titel ||
                    "Feuerwehr-Prüfung",

                    typ ||
                    "Eigene Prüfung",

                    material,

                    JSON.stringify(
                        questions
                    ),

                    Number(zeit) || 30,

                    Number(grenze) || 70,

                    code,

                    created

                );


            const baseUrl =
                process.env.FRONTEND_URL
                    ? process.env.FRONTEND_URL.replace(
                        /\/$/,
                        ""
                    )
                    : "";


            const link =
                baseUrl
                    ? `${baseUrl}/pruefung.html?code=${code}`
                    : `/pruefung.html?code=${code}`;


            res.json({

                success: true,

                id:
                    result.lastInsertRowid,

                titel:
                    titel ||
                    "Feuerwehr-Prüfung",

                code,

                questions,

                link

            });


        } catch (error) {

            console.error(
                error
            );


            res.status(500)
                .json({

                    error:
                        error.message ||
                        "Interner Serverfehler."

                });

        }

    }
);


/*
========================================================
ALLE PRÜFUNGEN
========================================================
*/


app.get(
    "/api/pruefungen",
    (req, res) => {

        try {

            const rows =
                db.prepare(`

                    SELECT
                        id,
                        titel,
                        typ,
                        code,
                        zeitlimit,
                        bestehensgrenze,
                        erstellt_am,
                        fragen
                    FROM pruefungen
                    ORDER BY id DESC

                `)
                .all();


            const result =
                rows.map(
                    row => ({

                        id:
                            row.id,

                        titel:
                            row.titel,

                        typ:
                            row.typ,

                        code:
                            row.code,

                        zeitlimit:
                            row.zeitlimit,

                        bestehensgrenze:
                            row.bestehensgrenze,

                        erstellt_am:
                            row.erstellt_am,

                        fragen_anzahl:
                            JSON.parse(
                                row.fragen
                            ).length

                    })
                );


            res.json(
                result
            );


        } catch (error) {

            res.status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


/*
========================================================
PRÜFUNG PER CODE
========================================================
*/


app.get(
    "/api/pruefungen/code/:code",
    (req, res) => {

        try {

            const row =
                db.prepare(`

                    SELECT *

                    FROM pruefungen

                    WHERE code = ?

                `)
                .get(
                    req.params.code
                );


            if (!row) {

                return res.status(404)
                    .json({

                        error:
                            "Prüfung nicht gefunden."

                    });

            }


            const questions =
                JSON.parse(
                    row.fragen
                );


            /*
            Dem Teilnehmer werden die
            richtigen Antworten NICHT geschickt.
            */

            const publicQuestions =
                questions.map(
                    q => ({

                        id:
                            q.id,

                        question:
                            q.question,

                        type:
                            q.type,

                        options:
                            q.options,

                        points:
                            q.points

                    })
                );


            res.json({

                id:
                    row.id,

                titel:
                    row.titel,

                typ:
                    row.typ,

                questions:
                    publicQuestions,

                zeitlimit:
                    row.zeitlimit

            });


        } catch (error) {

            res.status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


/*
========================================================
TEILNEHMER ABGEBEN
========================================================
*/


app.post(
    "/api/teilnehmer/abgabe",
    (req, res) => {

        try {

            const {

                code,

                vorname,

                nachname,

                feuerwehr,

                answers

            } = req.body;


            if (
                !code ||
                !vorname ||
                !nachname ||
                !feuerwehr ||
                !Array.isArray(answers)
            ) {

                return res.status(400)
                    .json({

                        error:
                            "Ungültige Prüfungsabgabe."

                    });

            }


            const exam =
                db.prepare(`

                    SELECT *

                    FROM pruefungen

                    WHERE code = ?

                `)
                .get(
                    code
                );


            if (!exam) {

                return res.status(404)
                    .json({

                        error:
                            "Prüfung nicht gefunden."

                    });

            }


            const questions =
                JSON.parse(
                    exam.fragen
                );


            let points = 0;

            let maxPoints = 0;


            questions.forEach(
                (question, index) => {

                    const qPoints =
                        Number(
                            question.points || 1
                        );


                    maxPoints +=
                        qPoints;


                    const answer =
                        answers[index];


                    if (
                        question.type ===
                        "multiple"
                    ) {

                        if (
                            Number(answer) ===
                            Number(
                                question.correctAnswer
                            )
                        ) {

                            points +=
                                qPoints;

                        }

                    }


                    else if (
                        question.type ===
                        "truefalse"
                    ) {

                        const normalized =
                            answer === true ||
                            answer === "true";


                        if (
                            normalized ===
                            question.correctAnswer
                        ) {

                            points +=
                                qPoints;

                        }

                    }


                    else if (
                        question.type ===
                        "text"
                    ) {

                        /*
                        Freitext wird hier nicht
                        automatisch als endgültig
                        bewertet.

                        Die vorhandenen Keywords
                        dienen nur als einfache
                        Vorbewertung.

                        */

                        if (
                            typeof answer ===
                            "string"
                        ) {

                            const text =
                                answer
                                    .toLowerCase();


                            const keywords =
                                question.keywords ||
                                [];


                            if (
                                keywords.length > 0
                            ) {

                                const found =
                                    keywords.filter(
                                        keyword =>
                                            text.includes(
                                                String(
                                                    keyword
                                                ).toLowerCase()
                                            )
                                    ).length;


                                if (
                                    found ===
                                    keywords.length
                                ) {

                                    points +=
                                        qPoints;

                                }

                            }

                        }

                    }

                }
            );


            const percentage =
                maxPoints > 0
                    ? Math.round(
                        (
                            points /
                            maxPoints
                        ) * 100
                    )
                    : 0;


            const passed =
                percentage >=
                Number(
                    exam.bestehensgrenze
                );


            const submitted =
                new Date()
                    .toISOString();


            const insert =
                db.prepare(`

                    INSERT INTO teilnehmer (

                        pruefung_id,
                        vorname,
                        nachname,
                        feuerwehr,
                        antworten,
                        punkte,
                        max_punkte,
                        prozent,
                        bestanden,
                        abgegeben_am

                    )

                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)

                `);


            const result =
                insert.run(

                    exam.id,

                    vorname,

                    nachname,

                    feuerwehr,

                    JSON.stringify(
                        answers
                    ),

                    points,

                    maxPoints,

                    percentage,

                    passed ? 1 : 0,

                    submitted

                );


            res.json({

                success: true,

                id:
                    result.lastInsertRowid

            });


        } catch (error) {

            console.error(
                error
            );


            res.status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


/*
========================================================
ERGEBNIS EINZELNER TEILNEHMER
========================================================
*/


app.get(
    "/api/teilnehmer/:id",
    (req, res) => {

        try {

            const row =
                db.prepare(`

                    SELECT *

                    FROM teilnehmer

                    WHERE id = ?

                `)
                .get(
                    req.params.id
                );


            if (!row) {

                return res.status(404)
                    .json({

                        error:
                            "Teilnehmer nicht gefunden."

                    });

            }


            res.json({

                id:
                    row.id,

                vorname:
                    row.vorname,

                nachname:
                    row.nachname,

                feuerwehr:
                    row.feuerwehr,

                punkte:
                    row.punkte,

                maxPunkte:
                    row.max_punkte,

                prozent:
                    row.prozent,

                bestanden:
                    Boolean(
                        row.bestanden
                    )

            });


        } catch (error) {

            res.status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


/*
========================================================
AUSWERTUNG
========================================================
*/


app.get(
    "/api/auswertung/:id",
    (req, res) => {

        try {

            const exam =
                db.prepare(`

                    SELECT *

                    FROM pruefungen

                    WHERE id = ?

                `)
                .get(
                    req.params.id
                );


            if (!exam) {

                return res.status(404)
                    .json({

                        error:
                            "Prüfung nicht gefunden."

                    });

            }


            const participants =
                db.prepare(`

                    SELECT *

                    FROM teilnehmer

                    WHERE pruefung_id = ?

                    ORDER BY id DESC

                `)
                .all(
                    exam.id
                );


            const count =
                participants.length;


            const passed =
                participants.filter(
                    p =>
                        Boolean(
                            p.bestanden
                        )
                ).length;


            const average =
                count > 0
                    ? Math.round(
                        participants.reduce(
                            (
                                sum,
                                p
                            ) =>
                                sum +
                                Number(
                                    p.prozent
                                ),
                            0
                        ) / count
                    )
                    : 0;


            res.json({

                exam: {

                    id:
                        exam.id,

                    titel:
                        exam.titel,

                    code:
                        exam.code

                },


                stats: {

                    teilnehmer:
                        count,

                    bestanden:
                        passed,

                    nichtBestanden:
                        count - passed,

                    durchschnitt:
                        average

                },


                teilnehmer:
                    participants.map(
                        p => ({

                            id:
                                p.id,

                            vorname:
                                p.vorname,

                            nachname:
                                p.nachname,

                            feuerwehr:
                                p.feuerwehr,

                            punkte:
                                p.punkte,

                            max_punkte:
                                p.max_punkte,

                            prozent:
                                p.prozent,

                            bestanden:
                                Boolean(
                                    p.bestanden
                                )

                        })
                    )

            });


        } catch (error) {

            res.status(500)
                .json({

                    error:
                        error.message

                });

        }

    }
);


/*
========================================================
SERVER STARTEN
========================================================
*/


app.listen(
    PORT,
    () => {

        console.log(
            `Feuerwehr Prüfungs-Backend läuft auf Port ${PORT}`
        );

    }
);
