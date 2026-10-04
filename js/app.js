$(function () {
  // ?d=5 shortens each step for quick testing; default is 30 seconds.
  var DURATION = Number(new URLSearchParams(location.search).get('d')) || 30;
  var STEPS = [
    { key: 'front', label: 'ID front', facing: 'environment', shape: 'card', text: 'Hold the FRONT of your ID card inside the frame. Keep it steady and readable for 30 seconds.' },
    { key: 'back',  label: 'ID back',  facing: 'environment', shape: 'card', text: 'Now show the BACK of your ID card inside the frame for 30 seconds.' },
    { key: 'face',  label: 'face',     facing: 'user',        shape: 'face', text: 'Place your face inside the oval and look at the camera for 30 seconds.' }
  ];
  var $video = $('#video'), $guide = $('#guide'), $timer = $('#timer'), $btn = $('#start'),
      $msg = $('#msg'), $bar = $('#bar i'), $info = $('#saveinfo');
  var stream = null, index = 0, busy = false, dirHandle = null;
  var session = new Date().toISOString().replace(/[:.]/g, '-');

  function setMsg(t, err) { $msg.text(t).toggleClass('err', !!err); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function paintSteps() {
    $.each(STEPS, function (i, s) {
      $('#s-' + s.key).removeClass('active done').addClass(i < index ? 'done' : i === index ? 'active' : '');
    });
  }
  function pickMime() {
    return ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find(function (m) {
      return window.MediaRecorder && MediaRecorder.isTypeSupported(m);
    });
  }
  function stopCamera() {
    if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
    stream = null;
  }
  function resetUi() {
    stopCamera();
    $timer.removeClass('rec'); $guide.removeClass('rec'); $bar.css('width', 0);
  }

  async function openCamera(step) {
    stopCamera();
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: step.facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    $video[0].srcObject = stream;
    $video.toggleClass('mirror', step.facing === 'user');
    $guide.attr('class', step.shape).show();
    await $video[0].play().catch(function () {});
  }

  function record(mime) {
    return new Promise(function (resolve, reject) {
      var chunks = [], startedAt = performance.now(), tick;
      var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2500000 });
      rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      rec.onerror = function (e) { clearInterval(tick); reject(e.error || new Error('Recording failed')); };
      rec.onstop = function () { clearInterval(tick); resolve(new Blob(chunks, { type: mime.split(';')[0] })); };
      tick = setInterval(function () {
        var left = Math.max(0, DURATION - (performance.now() - startedAt) / 1000);
        $timer.text(Math.ceil(left) + 's');
        $bar.css('width', ((DURATION - left) / DURATION * 100) + '%');
        if (left <= 0) rec.stop();
      }, 100);
      rec.start(1000);
      $timer.addClass('rec'); $guide.addClass('rec');
    });
  }

  // Save into the chosen "profiles" folder (File System Access API, Chrome/Edge);
  // otherwise fall back to a normal browser download.
  async function save(step, blob) {
    var name = step.key + (blob.type === 'video/mp4' ? '.mp4' : '.webm');
    if (dirHandle) {
      var sub = await dirHandle.getDirectoryHandle(session, { create: true });
      var fh = await sub.getFileHandle(name, { create: true });
      var w = await fh.createWritable();
      await w.write(blob);
      await w.close();
      return 'profiles/' + session + '/' + name;
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = session + '-' + name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
    return 'Downloads/' + a.download;
  }

  async function chooseFolder() {
    if (!window.showDirectoryPicker) {
      $info.text('This browser cannot write to a folder, so videos will be downloaded instead. Use Chrome or Edge to save into "profiles".');
      return;
    }
    try {
      setMsg('Choose the "profiles" folder…');
      dirHandle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'profiles' });
      $info.text('Saving into the "' + dirHandle.name + '" folder you selected.');
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Please choose the "profiles" folder to continue.');
      throw e;
    }
  }

  async function runStep() {
    if (busy) return;
    busy = true; $btn.prop('disabled', true); setMsg('');
    var step = STEPS[index];
    try {
      if (index === 0 && !dirHandle && !$info.text()) await chooseFolder();
      var mime = pickMime();
      if (!mime) throw new Error('This browser cannot record video.');
      $('#instruction').text(step.text.replace('30 seconds', DURATION + ' seconds'));
      await openCamera(step);
      for (var n = 3; n > 0; n--) { setMsg('Get ready… ' + n); await sleep(1000); }
      setMsg('Recording…');
      var blob = await record(mime);
      resetUi();
      setMsg('Saving video…');
      var where = await save(step, blob);
      index++; paintSteps();
      $guide.hide(); $video[0].srcObject = null;
      if (index < STEPS.length) {
        var next = STEPS[index];
        $('#instruction').text('Step ' + index + ' saved. Next: ' + next.label + '.');
        $btn.text('Start step ' + (index + 1) + ' (' + next.label + ')').prop('disabled', false);
        setMsg('Saved to ' + where);
      } else {
        $('#instruction').text('Verification videos recorded. Thank you!');
        $btn.text('Done');
        setMsg('All 3 videos saved (last: ' + where + ').');
      }
    } catch (e) {
      resetUi();
      var denied = e && (e.name === 'NotAllowedError' || e.name === 'NotFoundError');
      setMsg(denied ? 'Camera access is required.' : (e.message || 'Something went wrong.'), true);
      $btn.text(index === 0 ? 'Try again' : 'Retry this step').prop('disabled', false);
    } finally { busy = false; }
  }

  $btn.on('click', runStep);
  paintSteps();
});
