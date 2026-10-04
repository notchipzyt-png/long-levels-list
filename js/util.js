// https://stackoverflow.com/questions/3452546/how-do-i-get-the-youtube-video-id-from-a-url
export function getYoutubeIdFromUrl(url) {
    return url.match(
        /.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=)([^#\&\?]*).*/,
    )?.[1] ?? '';
}

/**
 * Convert a Medal clip page into Medal's canonical embeddable URL.
 *
 * Medal share links commonly use /games/<game>/clips/<clip-id> and may
 * include invite/tracking query parameters. The iframe player expects the
 * shorter /clip/<clip-id> URL; passing the share URL (or adding ?embed=1)
 * causes Medal to display an error.
 */
export function getMedalEmbedUrl(video) {
    try {
        const url = new URL(video);
        const hostname = url.hostname.toLowerCase();
        if (hostname !== 'medal.tv' && !hostname.endsWith('.medal.tv')) {
            return null;
        }

        const parts = url.pathname.split('/').filter(Boolean);
        const clipIndex = parts.findIndex((part) => part.toLowerCase() === 'clips');
        const clipId = clipIndex >= 0 ? parts[clipIndex + 1] : null;

        // Also accept already-canonical /clip/<id> links.
        const canonicalId =
            parts[0]?.toLowerCase() === 'clip' ? parts[1] : clipId;
        if (!canonicalId) return null;

        return `https://medal.tv/clip/${encodeURIComponent(canonicalId)}`;
    } catch {
        return null;
    }
}

export function embed(video) {
    const medalUrl = getMedalEmbedUrl(video);
    if (medalUrl) return medalUrl;

    return `https://www.youtube.com/embed/${getYoutubeIdFromUrl(video)}`;
}

export function localize(num) {
    return num.toLocaleString(undefined, { minimumFractionDigits: 3 });
}

export function getThumbnailFromId(id) {
    return `https://img.youtube.com/vi/${id}/mqdefault.jpg`;
}

// https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-an-array
export function shuffle(array) {
    let currentIndex = array.length, randomIndex;

    // While there remain elements to shuffle.
    while (currentIndex != 0) {
        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the last element.
        [array[currentIndex], array[randomIndex]] = [
            array[randomIndex],
            array[currentIndex],
        ];
    }

    return array;
}
