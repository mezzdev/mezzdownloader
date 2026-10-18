const input = document.querySelector("#video-url");
const button = document.querySelector("#download-btn");
const status = document.querySelector("#status");

button.addEventListener("click", async () => {
    const url = input.value.trim();

    if (!url) {
        status.textContent = "[?] clique sur rectangle";
        return;
    }

    button.disabled = true;
    status.textContent = "[!] Traitement de la vidéo...";

    try {
        const response = await fetch("/download", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ url })
        });

        const contentType = response.headers.get("content-type") || "";

        if (!response.ok) {
            const data = contentType.includes("application/json")
                ? await response.json()
                : { error: "Le téléchargement a échoué." };

            throw new Error(data.error);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = objectUrl;
        link.download = ".mp4";
        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(objectUrl);
        status.textContent = "[!] Téléchargement terminé.";
    } catch (error) {
        status.textContent = error.message || "[?] Une erreur est survenue.";
    } finally {
        button.disabled = false;
    }
});

input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        button.click();
    }
});