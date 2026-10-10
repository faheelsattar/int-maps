import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const IMAGE_MODEL = process.env.IMAGE_MODEL || 'gemini-nano-banana-2.1';
const VIDEO_MODEL = process.env.VIDEO_MODEL || 'gemini-omni-1.1-flash';
const VIDEO_ENABLED = process.env.ENABLE_VIDEO !== 'false';
const VIDEO_CONCURRENCY = Number(process.env.VIDEO_CONCURRENCY || 3);

// Generated media lives in memory and is served from /media/:id (fine for a demo).
const media = new Map();
const MAX_MEDIA = 80;

function putMedia(buf, mime) {
  const id = randomUUID();
  media.set(id, { buf, mime });
  if (media.size > MAX_MEDIA) media.delete(media.keys().next().value);
  return `/media/${id}`;
}

function limiter(max) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= max || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn().then(resolve, reject).finally(() => {
      active--;
      next();
    });
  };
  return (fn) => new Promise((resolve, reject) => (queue.push({ fn, resolve, reject }), next()));
}
const videoSlot = limiter(VIDEO_CONCURRENCY);

function errorText(err) {
  const msg = err?.message || String(err);
  try {
    return JSON.parse(msg).error?.message || msg;
  } catch {
    return msg;
  }
}

function imagePrompt(story, i) {
  return `${story.artStyle}. Scene ${i + 1} of ${story.scenes.length} from the true historical story "${story.title}" (${story.date || story.year}, ${story.place}).
${story.scenes[i]}
Historically accurate architecture, clothing, technology and landscape for the period. Cinematic 16:9 wide composition with depth, dramatic natural lighting, rich atmosphere.
Absolutely no text, captions, lettering, borders or watermarks. Depict hardship with restraint, no gore.`;
}

async function paint(ai, prompt, previousId) {
  const interaction = await ai.interactions.create({
    model: IMAGE_MODEL,
    input: previousId
      ? `Next scene of the same story. Keep the exact same art style, colour palette and recurring characters.\n${prompt}`
      : prompt,
    ...(previousId ? { previous_interaction_id: previousId } : {}),
    response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '16:9', image_size: '1K' },
  });
  const img = interaction.output_image;
  if (!img?.data) throw new Error('No image returned (possibly blocked by safety filters)');
  return { id: interaction.id, data: img.data, mime: img.mime_type || 'image/jpeg' };
}

async function animate(ai, image, story, i) {
  const interaction = await ai.interactions.create({
    model: VIDEO_MODEL,
    input: [
      { type: 'image', data: image.data, mime_type: image.mime },
      {
        type: 'text',
        text: `Bring this ${story.artStyle} image to life as one continuous cinematic shot. ${story.scenes[i]}
Use the image as the exact first frame and keep its art style, composition and characters. Subtle, natural, period-accurate motion with a slow camera push-in.
Audio: ambient environmental sound only. Do not include speech, voices, narration or music. Do not add any text.`,
      },
    ],
    generation_config: { video_config: { task: 'image_to_video' } },
    response_format: { type: 'video', aspect_ratio: '16:9', resolution: '720p' },
    store: false,
  });
  const video = interaction.output_video;
  if (video?.data) return Buffer.from(video.data, 'base64');
  if (video?.uri) return downloadFile(ai, video.uri);
  throw new Error('No video returned (possibly blocked by safety filters)');
}

// Large videos come back as a Files API URI: wait for ACTIVE, then download.
async function downloadFile(ai, uri) {
  const name = `files/${uri.match(/files\/([a-zA-Z0-9_-]+)/)?.[1]}`;
  for (let i = 0; i < 60; i++) {
    const info = await ai.files.get({ name });
    if (info.state === 'ACTIVE') break;
    if (info.state === 'FAILED') throw new Error('Video processing failed');
    await new Promise((r) => setTimeout(r, 3000));
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'echoes-'));
  const file = path.join(dir, 'clip.mp4');
  try {
    await ai.files.download({ file: name, downloadPath: file });
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export function registerSceneRoutes(app, ai) {
  app.get('/media/:id', (req, res) => {
    const m = media.get(req.params.id);
    if (!m) return res.status(404).end();
    res.setHeader('Content-Type', m.mime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(m.buf);
  });

  // Streams NDJSON events: {type:'image'|'video', index, src} | {type:'error', index, kind, message} | {type:'done'}
  app.post('/api/scenes', async (req, res) => {
    const b = req.body ?? {};
    const scenes = Array.isArray(b.scenes) ? b.scenes.slice(0, 6).map((s) => String(s).slice(0, 600)) : [];
    if (!scenes.length) return res.status(400).json({ error: 'scenes are required' });
    const story = {
      title: String(b.title ?? '').slice(0, 120),
      date: String(b.date ?? '').slice(0, 60),
      year: b.year,
      place: String(b.place ?? '').slice(0, 160),
      artStyle: String(b.artStyle ?? 'cinematic painterly historical illustration').slice(0, 200),
      scenes,
    };
    const wantVideo = VIDEO_ENABLED && b.animate !== false;

    let closed = false;
    res.on('close', () => (closed = true));
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-cache');
    res.flushHeaders();
    const send = (msg) => !closed && res.write(JSON.stringify(msg) + '\n');
    send({ type: 'start', count: scenes.length, video: wantVideo });

    const videoJobs = [];
    const onImage = (i, img) => {
      send({ type: 'image', index: i, src: putMedia(Buffer.from(img.data, 'base64'), img.mime) });
      if (!wantVideo) return;
      videoJobs.push(
        videoSlot(async () => {
          if (closed) return;
          try {
            const clip = await animate(ai, img, story, i);
            send({ type: 'video', index: i, src: putMedia(clip, 'video/mp4') });
          } catch (err) {
            console.error(`[scenes] video ${i} failed:`, errorText(err));
            send({ type: 'error', index: i, kind: 'video', message: errorText(err) });
          }
        }),
      );
    };

    // Scene 1 first, then the rest in parallel, chained off scene 1 for visual consistency.
    let first = null;
    try {
      first = await paint(ai, imagePrompt(story, 0));
      onImage(0, first);
    } catch (err) {
      console.error('[scenes] image 0 failed:', errorText(err));
      send({ type: 'error', index: 0, kind: 'image', message: errorText(err) });
    }
    await Promise.all(
      scenes.slice(1).map(async (_, k) => {
        const i = k + 1;
        if (closed) return;
        try {
          let img;
          try {
            img = await paint(ai, imagePrompt(story, i), first?.id);
          } catch (err) {
            if (!first?.id) throw err;
            img = await paint(ai, imagePrompt(story, i)); // chaining unsupported: paint standalone
          }
          onImage(i, img);
        } catch (err) {
          console.error(`[scenes] image ${i} failed:`, errorText(err));
          send({ type: 'error', index: i, kind: 'image', message: errorText(err) });
        }
      }),
    );
    await Promise.all(videoJobs);
    send({ type: 'done' });
    res.end();
  });
}
