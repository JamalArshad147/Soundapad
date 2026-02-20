let globalAudioContext = null;
let globalStreamDestination = null;
let activeSource = null;
let activeBuffer = null;
let startTime = 0;
let pauseOffset = 0;
let isPaused = false;
let currentPlayingId = null;
let progressInterval = null;

const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

navigator.mediaDevices.getUserMedia = async function (constraints)
{
    const rawStream = await originalGetUserMedia(constraints);
    const audioCtx = new AudioContext();
    globalAudioContext = audioCtx;
    const source = audioCtx.createMediaStreamSource(rawStream);
    const destination = audioCtx.createMediaStreamDestination();
    globalStreamDestination = destination;
    source.connect(destination);
    return destination.stream;
};

window.addEventListener("message", async (event) =>
{
    if (!globalAudioContext) return;

    if (event.data.type === "inject_sound")
    {
        currentPlayingId = event.data.id;
        await playAudio(event.data.audioData);
    }

    if (event.data.type === "TOGGLE_AUDIO")
    {
        if (activeSource && !isPaused)
        {
            activeSource.stop();
            pauseOffset += globalAudioContext.currentTime - startTime;
            isPaused = true;
            stopHeartbeat();
            notifyPopup("PAUSED");
        } else if (isPaused && activeBuffer)
        {
            playBuffer(activeBuffer, pauseOffset);
            isPaused = false;
            startHeartbeat();
            notifyPopup("PLAYING");
        }
    }

    if (event.data.type === "RESTART_AUDIO")
    {
        if (activeSource) activeSource.stop();
        pauseOffset = 0;
        playBuffer(activeBuffer, 0);
        isPaused = false;
        startHeartbeat();
        notifyPopup("PLAYING");
    }
});

async function playAudio(base64)
{
    if (activeSource) try { activeSource.stop(); } catch (e) { }
    pauseOffset = 0;
    isPaused = false;
    const response = await fetch(base64);
    const arrayBuffer = await response.arrayBuffer();
    activeBuffer = await globalAudioContext.decodeAudioData(arrayBuffer);
    playBuffer(activeBuffer, 0);
    startHeartbeat();
    notifyPopup("PLAYING");
}

function playBuffer(buffer, offset)
{
    const source = globalAudioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(globalStreamDestination);
    source.connect(globalAudioContext.destination);

    source.onended = () =>
    {
        const currentPos = (globalAudioContext.currentTime - startTime) + offset;
        if (!isPaused && currentPos >= buffer.duration - 0.2)
        {
            stopHeartbeat();
            notifyPopup("ENDED");
        }
    };

    source.start(0, offset % buffer.duration);
    activeSource = source;
    startTime = globalAudioContext.currentTime;
}

function startHeartbeat()
{
    stopHeartbeat();
    progressInterval = setInterval(() =>
    {
        const currentPos = (globalAudioContext.currentTime - startTime) + pauseOffset;
        notifyPopup("PLAYING", currentPos);
    }, 250);
}

function stopHeartbeat()
{
    if (progressInterval) clearInterval(progressInterval);
}

function notifyPopup(status, currentTime)
{
    const timeToSend = currentTime !== undefined ? currentTime : (isPaused ? pauseOffset : (globalAudioContext.currentTime - startTime + pauseOffset));
    window.postMessage({
        type: "STATUS_UPDATE",
        status: status,
        id: currentPlayingId,
        currentTime: timeToSend
    }, "*");
}