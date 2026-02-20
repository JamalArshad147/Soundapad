let mediaRecorder, audioChunks = [], animationId, audioContext, analyser, dataArray;
let currentPlayingId = null;
let currentStatus = "IDLE";
let lastReceivedTime = 0;

chrome.runtime.onMessage.addListener((msg) =>
{
    if (msg.type === "STATUS_UPDATE")
    {
        currentPlayingId = (msg.status === "ENDED") ? null : msg.id;
        currentStatus = msg.status;
        lastReceivedTime = msg.currentTime || 0;
        loadRecordings();
    }
});

// --- RECORDING LOGIC ---
document.getElementById('btnRecord').onclick = async () =>
{
    try
    {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setupVisualizer(stream);
        drawVisualizer();
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        let startTimeRec = Date.now();
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () =>
        {
            const duration = formatTime((Date.now() - startTimeRec) / 1000);
            const reader = new FileReader();
            reader.readAsDataURL(new Blob(audioChunks));
            reader.onloadend = () =>
            {
                const name = prompt("Name recording:", "New Recording");
                if (name) addRecording({ id: Date.now(), name, data: reader.result, duration, isSaved: false });
            };
            stream.getTracks().forEach(t => t.stop());
            cancelAnimationFrame(animationId);
            updateUI("inactive");
        };
        mediaRecorder.start();
        updateUI("recording");
    } catch (e) { chrome.tabs.create({ url: "setup.html" }); }
};

document.getElementById('btnPause').onclick = () =>
{
    if (mediaRecorder.state === "recording") { mediaRecorder.pause(); updateUI("paused"); }
    else { mediaRecorder.resume(); updateUI("recording"); }
};

document.getElementById('btnStop').onclick = () => mediaRecorder.stop();

function formatTime(s)
{
    const min = Math.floor(s / 60);
    const sec = Math.floor(Math.max(0, s % 60));
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function updateUI(s)
{
    const bR = document.getElementById('btnRecord'), bP = document.getElementById('btnPause'), bS = document.getElementById('btnStop'), st = document.getElementById('status');
    bR.disabled = (s !== "inactive");
    bP.disabled = (s === "inactive");
    bS.disabled = (s === "inactive");
    bP.innerText = (s === "paused") ? "Resume" : "Pause";
    st.innerText = s === "recording" ? "Recording..." : s === "paused" ? "Paused" : "Ready";
}

function addRecording(rec)
{
    chrome.storage.local.get(['myRecordings'], (res) =>
    {
        let list = res.myRecordings || [];
        list.unshift(rec);
        chrome.storage.local.set({ myRecordings: list }, () => loadRecordings());
    });
}

function loadRecordings()
{
    chrome.storage.local.get(['myRecordings'], (res) =>
    {
        const list = document.getElementById('recordingsList');
        list.innerHTML = '';
        (res.myRecordings || []).forEach((rec, index) =>
        {
            const li = document.createElement('li');
            li.className = 'recording-item';

            const isActive = (currentPlayingId == rec.id);
            const isPlaying = isActive && currentStatus === "PLAYING";

            const displayTime = isActive ? `${formatTime(lastReceivedTime)} / ${rec.duration}` : rec.duration;
            const toggleText = isPlaying ? 'PAUSE' : 'PLAY';

            li.innerHTML = `
                <div class="rec-info">
                    <div class="rec-name">${rec.name}</div>
                    <div style="font-size:10px; color:#888">${displayTime}</div>
                </div>
                <div style="width:60px; height:30px; display: flex; align-items: center;">
                    <canvas class="wave-canvas" id="wave-${rec.id}" style="display: ${isActive ? 'block' : 'none'}"></canvas>
                </div>
                <div class="actions">
                    <button class="text-btn play" id="play-${rec.id}">${toggleText}</button>
                    <button class="text-btn restart" id="rest-${rec.id}">RESTART</button>
                    ${!rec.isSaved ? `<button class="text-btn save" id="save-${rec.id}">SAVE</button>` : ''}
                    <button class="text-btn delete" id="del-${rec.id}">DEL</button>
                </div>
            `;
            list.appendChild(li);

            document.getElementById(`play-${rec.id}`).onclick = () =>
            {
                if (!isActive) sendCommand("inject_sound", rec.data, rec.id);
                else sendCommand("TOGGLE_AUDIO", null, rec.id);
            };
            document.getElementById(`rest-${rec.id}`).onclick = () => sendCommand("RESTART_AUDIO", null, rec.id);
            document.getElementById(`del-${rec.id}`).onclick = () => deleteRecording(rec.id);

            if (!rec.isSaved)
            {
                document.getElementById(`save-${rec.id}`).onclick = () => downloadToFolder(rec, index);
            }

            if (isActive) startWaveAnimation(`wave-${rec.id}`, isPlaying);
        });
    });
}

function downloadToFolder(recording, index)
{
    chrome.downloads.download({
        url: recording.data,
        filename: `Soundpad Recordings/${recording.name}.wav`,
        saveAs: false
    }, () =>
    {
        if (!chrome.runtime.lastError)
        {
            chrome.storage.local.get(['myRecordings'], (result) =>
            {
                let recordings = result.myRecordings || [];
                if (recordings[index])
                {
                    recordings[index].isSaved = true;
                    chrome.storage.local.set({ myRecordings: recordings }, () => loadRecordings());
                }
            });
        }
    });
}

function startWaveAnimation(canvasId, isActuallyPlaying)
{
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let offset = 0;
    function animate()
    {
        if (!document.getElementById(canvasId) || currentPlayingId != canvasId.split('-')[1]) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.beginPath();
        ctx.strokeStyle = '#2ed573';
        ctx.lineWidth = 2;
        for (let x = 0; x < canvas.width; x++)
        {
            const amplitude = isActuallyPlaying ? 8 : 0;
            let y = canvas.height / 2 + Math.sin(x * 0.2 + offset) * amplitude;
            ctx.lineTo(x, y);
        }
        ctx.stroke();
        if (isActuallyPlaying) offset += 0.3;
        requestAnimationFrame(animate);
    }
    animate();
}

function sendCommand(action, data, id)
{
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
    {
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action, audioData: data, id });
    });
}

function deleteRecording(id)
{
    if (!confirm("Delete?")) return;
    chrome.storage.local.get(['myRecordings'], (res) =>
    {
        chrome.storage.local.set({ myRecordings: (res.myRecordings || []).filter(r => r.id !== id) }, () => loadRecordings());
    });
}

function setupVisualizer(stream)
{
    audioContext = new AudioContext();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    audioContext.createMediaStreamSource(stream).connect(analyser);
}

function drawVisualizer()
{
    const canvas = document.getElementById("visualizer"), ctx = canvas.getContext("2d");
    function draw()
    {
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        let x = 0, barW = (canvas.width / dataArray.length) * 2.5;
        dataArray.forEach(v =>
        {
            ctx.fillStyle = `rgb(${v + 100},50,50)`;
            ctx.fillRect(x, canvas.height - v / 2, barW, v / 2);
            x += barW + 1;
        });
    }
    draw();
}

document.getElementById('btnImport').onclick = () => document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange = (e) =>
{
    Array.from(e.target.files).forEach(file =>
    {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () =>
        {
            const temp = new Audio(reader.result);
            temp.onloadedmetadata = () => addRecording({ id: Date.now() + Math.random(), name: file.name.split('.')[0], data: reader.result, duration: formatTime(temp.duration), isSaved: true });
        };
    });
};

loadRecordings();