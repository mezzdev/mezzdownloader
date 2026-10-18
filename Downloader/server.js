
const express = require("express");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public")));

const allowedHosts = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "tiktok.com",
    "www.tiktok.com",
    "m.tiktok.com",
    "vm.tiktok.com",
    "vt.tiktok.com"
]);

app.post("/download", async (req, res) => {
    const { url } = req.body || {};
    let parsed;

    try {
        if (typeof url !== "string") throw new Error();
        parsed = new URL(url);
    } catch {
        return res.status(400).json({ error: "URL invalide." });
    }

    if (
        parsed.protocol !== "https:" ||
        !allowedHosts.has(parsed.hostname.toLowerCase()) ||
        parsed.username ||
        parsed.password
    ) {
        return res.status(400).json({
            error: "URL YouTube ou TikTok non prise en charge."
        });
    }

    const directory = path.join(os.tmpdir(), `mezz-${crypto.randomUUID()}`);
    const output = path.join(directory, "%(id)s.%(ext)s");

    let finished = false;
    let timedOut = false;

    try {
        await fs.mkdir(directory, { recursive: true });

        const args = [
            "--no-playlist",
            "--no-warnings",
            "-f", "bestvideo+bestaudio/best",
            "--merge-output-format", "mp4",
            "-o", output,
            "--print", "after_move:filepath",
            url
        ];

        const child = spawn("yt-dlp", args, {
            shell: false,
            windowsHide: true
        });

        let stdout = "";
        let stderr = "";

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, 120000);

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", data => {
            stdout = (stdout + data).slice(-10000);
        });

        child.stderr.on("data", data => {
            stderr = (stderr + data).slice(-5000);
        });

        child.on("error", async () => {
            clearTimeout(timer);

            if (finished) return;
            finished = true;

            await fs.rm(directory, { recursive: true, force: true });

            if (!res.headersSent) {
                res.status(500).json({
                    error: "yt-dlp est introuvable. Vérifie son installation."
                });
            }
        });

        child.on("close", async code => {
            clearTimeout(timer);

            if (finished) return;
            finished = true;

            if (code !== 0 || timedOut) {
                console.error("Erreur yt-dlp :", stderr);
                await fs.rm(directory, { recursive: true, force: true });

                if (!res.headersSent) {
                    res.status(timedOut ? 408 : 500).json({
                        error: timedOut
                            ? "Le téléchargement a pris trop de temps."
                            : stderr.trim().slice(-1000) ||
                              "Impossible de récupérer cette vidéo."
                    });
                }
                return;
            }

            const file = stdout.trim().split(/\r?\n/).pop();

            if (
                !file ||
                path.dirname(path.resolve(file)) !== path.resolve(directory) ||
                path.extname(file).toLowerCase() !== ".mp4"
            ) {
                await fs.rm(directory, { recursive: true, force: true });

                return res.status(500).json({
                    error: "Le fichier MP4 est introuvable."
                });
            }

            try {
                await fs.access(file);

                res.download(file, path.basename(file), async () => {
                    await fs.rm(directory, {
                        recursive: true,
                        force: true
                    });
                });
            } catch {
                await fs.rm(directory, { recursive: true, force: true });

                if (!res.headersSent) {
                    res.status(500).json({
                        error: "Fichier vidéo introuvable."
                    });
                }
            }
        });
    } catch {
        await fs.rm(directory, { recursive: true, force: true });

        if (!res.headersSent) {
            res.status(500).json({
                error: "Erreur interne du serveur."
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`MezzDownloader : http://localhost:${PORT}`);
});