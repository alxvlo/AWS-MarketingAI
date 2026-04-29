const UPLOAD_API = 'https://bj0iusoe6a.execute-api.ap-southeast-1.amazonaws.com/prod/upload';
const RESULTS_API = 'https://axxsy44fvk.execute-api.ap-southeast-1.amazonaws.com/prod/results';

const form = document.getElementById('upload-form');
const status = document.getElementById('status');

const log = (msg) => { status.textContent += msg + '\n'; };

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status.textContent = '';
  const email = document.getElementById('email').value.trim();
  const file = document.getElementById('photo').files[0];
  if (!file) return;

  try {
    log('1. Requesting upload URL...');
    const res = await fetch(UPLOAD_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, contentType: file.type }),
    });
    if (!res.ok) throw new Error(`Upload API returned ${res.status}: ${await res.text()}`);
    const { submissionId, uploadUrl } = await res.json();
    log(`   submissionId: ${submissionId}`);

    log('2. Uploading photo to S3...');
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!put.ok) throw new Error(`S3 PUT failed: ${put.status}`);
    log('   uploaded.');

    log('3. Waiting for emotion detection + email send...');
    const result = await pollResult(submissionId);
    log('4. Done!');
    log(JSON.stringify(result, null, 2));
  } catch (err) {
    log('ERROR: ' + err.message);
  }
});

async function pollResult(submissionId, attempts = 20, intervalMs = 1500) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${RESULTS_API}/${submissionId}`);
    if (res.ok) {
      const data = await res.json();
      if (data.emailSentAt) return data;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error('Timed out waiting for email send.');
}
