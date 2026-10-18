const express = require("express");
const { spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DOWNLOAD_TIMEOUT = 120000;

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

app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

app.post("/download", async (req, res) => {
    const { url } = req.body || {};
    let parsed;

    try {
        if (typeof url !== "string" || !url.trim()) {
            return res.status(400).json({
                error: "Veuillez fournir une URL"
            });
        }

        parsed = new URL(url.trim());
    } catch {
        return res.status(400).json({
            error: "URL invalide"
        });
    }

    if (
        parsed.protocol !== "https:" ||
        !allowedHosts.has(parsed.hostname.toLowerCase()) ||
        parsed.username ||
        parsed.password
    ) {
        return res.status(400).json({
            error: "URL YouTube ou TikTok non prise en charge"
        });
    }

    const directory = path.join(
        os.tmpdir(),
        `mezz-${crypto.randomUUID()}`
    );

    const output = path.join(directory, "%(id)s.%(ext)s");
    let child;
    let timer;
    let finished = false;
    let timedOut = false;
    let stdout = "";
    let stderr = "";

    const cleanup = async () => {
        if (timer) clearTimeout(timer);

        await fs.rm(directory, {
            recursive: true,
            force: true
        }).catch(() => {});
    };

    const fail = async (status, message) => {
        if (finished) return;
        finished = true;

        await cleanup();

        if (!res.headersSent && !res.destroyed) {
            res.status(status).json({ error: message });
        }
    };

    try {
        await fs.mkdir(directory, { recursive: true });

        const args = [
            "--no-playlist",
            "--no-warnings",
            "--js-runtimes", "node",
            "--remote-components", "ejs:npm",
            "-f", "bestvideo+bestaudio/best",
            "--merge-output-format", "mp4",
            "-o", output,
            "--print", "after_move:filepath",
            url.trim()
        ];

        child = spawn("yt-dlp", args, {
            shell: false,
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"]
        });

        timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
        }, DOWNLOAD_TIMEOUT);

        child.stdout.setEncoding("utf8");
        child.stderr.setEncoding("utf8");

        child.stdout.on("data", data => {
            stdout = (stdout + data).slice(-10000);
        });

        child.stderr.on("data", data => {
            stderr = (stderr + data).slice(-5000);
        });

        child.once("error", error => {
            console.error("Erreur de lancement yt-dlp :", error.message);

            fail(
                500,
                "Impossible de lancer yt-dlp. Vérifie son installation."
            );
        });

        child.once("close", async code => {
            if (finished) return;

            if (timedOut) {
                return fail(
                    408,
                    "Le téléchargement a dépassé le délai autorisé"
                );
            }

            if (code !== 0) {
                console.error("Erreur yt-dlp :", stderr);

                const botError =
                    /sign in to confirm|not a bot|captcha/i.test(stderr);

                return fail(
                    500,
                    botError
                        ? "YouTube demande une vérification anti-bot. Réessaie plus tard."
                        : stderr.trim().slice(-1000) ||
                          "Impossible de récupérer cette vidéo"
                );
            }

            const file = stdout.trim().split(/\r?\n/).pop();
            const resolvedDirectory = path.resolve(directory);

            if (
                !file ||
                path.dirname(path.resolve(file)) !== resolvedDirectory ||
                path.extname(file).toLowerCase() !== ".mp4"
            ) {
                return fail(
                    500,
                    "Le fichier MP4 est introuvable."
                );
            }

            try {
                const stat = await fs.stat(file);

                if (!stat.isFile()) {
                    return fail(500, "Le fichier vidéo est invalide.");
                }

                finished = true;
                clearTimeout(timer);

                res.download(
                    file,
                    path.basename(file),
                    async error => {
                        await cleanup();

                        if (error && !res.headersSent && !res.destroyed) {
                            res.status(500).json({
                                error: "Erreur pendant l'envoi du fichier."
                            });
                        }
                    }
                );
            } catch {
                return fail(
                    500,
                    "Le fichier vidéo est introuvable."
                );
            }
        });
    } catch (error) {
        console.error("Erreur serveur :", error.message);

        if (child && !child.killed) {
            child.kill("SIGKILL");
        }

        return fail(500, "Erreur interne du serveur.");
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`MezzDownloader démarré sur le port ${PORT}`);
});
```
