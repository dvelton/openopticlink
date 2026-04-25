import './style.css';
import { collectDiagnostics } from './lib/diagnostics';
import { PulseReceiver } from './lib/pulse-receiver';
import { clearInbox, loadInbox, saveToInbox } from './lib/storage';
import { MESSAGE_TEMPLATES } from './lib/templates';
import {
  PROFILES,
  byteLength,
  createMessageBundle,
  createRelayBundle,
  createTransmission,
  estimateDurationSeconds,
  formatSymbolLabel,
  type MessageKind,
  type MessageBundle,
  type PulseSymbol,
  type ProfileId,
  type Transmission,
} from './lib/protocol';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('App root not found.');
}

app.innerHTML = `
  <header class="hero">
    <p class="eyebrow">GitHub Pages PWA · no backend · no account</p>
    <h1>OpenOpticLink</h1>
    <p class="lede">Send short messages between ordinary phones using timed full-screen light pulses.</p>
    <div class="hero-actions">
      <a class="button primary" href="#send">Send</a>
      <a class="button" href="#receive">Receive</a>
      <a class="button" href="#guide">How it works</a>
    </div>
  </header>

  <main>
    <section id="send" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Transmit</p>
          <h2>Send from this screen</h2>
        </div>
        <span class="pill">Put the sender at max brightness</span>
      </div>
      <div class="grid two">
        <div class="card">
          <label for="message">Message</label>
          <textarea id="message" rows="7" placeholder="Type a short message. Example: Meet at the north gate."></textarea>
          <div class="template-row" id="templates"></div>
          <label for="profile">Distance profile</label>
          <select id="profile"></select>
          <p id="send-estimate" class="muted">Choose a message to estimate pulse time.</p>
          <div class="button-row">
            <button id="start-send" class="primary">Start sending</button>
            <button id="stop-send">Stop</button>
          </div>
        </div>
        <div class="card transmit-card" id="pulse-card">
          <div id="pulse-preview" class="pulse-preview" aria-label="Pulse preview">
            <span>PulseLink</span>
          </div>
          <p id="frame-status" class="status">Full-screen pulses appear when sending starts.</p>
        </div>
      </div>
    </section>

    <div id="pulse-screen" class="pulse-screen" aria-live="polite">
      <button id="stop-overlay" class="overlay-stop">Stop</button>
      <div id="pulse-overlay-label" class="pulse-overlay-label">PulseLink ready</div>
    </div>

    <section id="receive" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Receive</p>
          <h2>Read brightness pulses</h2>
        </div>
        <span class="pill">Works over HTTPS and after PWA install</span>
      </div>
      <div class="grid two">
        <div class="card">
          <video id="preview" muted playsinline></video>
          <div class="button-row">
            <button id="start-receive" class="primary">Start camera</button>
            <button id="stop-receive">Stop</button>
          </div>
          <p id="receive-status" class="status">Camera is off.</p>
          <div class="meter"><span id="luma-meter"></span></div>
          <p id="luma-status" class="muted">Brightness signal will appear here.</p>
          <progress id="receive-progress" max="1" value="0"></progress>
        </div>
        <div class="card">
          <h3>Decoded message</h3>
          <pre id="decoded-message" class="message-output">Nothing received yet.</pre>
          <p id="decoded-meta" class="muted"></p>
        </div>
      </div>
    </section>

    <section id="relay" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Relay</p>
          <h2>Store and forward</h2>
        </div>
        <button id="clear-inbox">Clear inbox</button>
      </div>
      <div id="inbox" class="inbox"></div>
    </section>

    <section id="diagnostics" class="panel">
      <div class="section-title">
        <div>
          <p class="eyebrow">Diagnostics</p>
          <h2>Browser readiness</h2>
        </div>
        <button id="refresh-diagnostics">Refresh</button>
      </div>
      <div id="diagnostics-list" class="diagnostics"></div>
    </section>

    <section id="guide" class="panel guide">
      <p class="eyebrow">Field guide</p>
      <h2>Use it like an optical packet link</h2>
      <div class="grid three">
        <article class="card">
          <h3>1. Start close</h3>
          <p>Use QuickLink or FieldLink at arm's length first. Once that works, try the slower pulse modes with steadier hands and camera zoom.</p>
        </article>
        <article class="card">
          <h3>2. Send short messages</h3>
          <p>Full-screen pulses are range-oriented, not high-bandwidth. Templates are intentionally compact.</p>
        </article>
        <article class="card">
          <h3>3. Relay when needed</h3>
          <p>Any receiver can retransmit a message from its own screen. Distance scales through people, windows, vehicles, or ridgelines.</p>
        </article>
      </div>
    </section>
  </main>
`;

const messageInput = requireElement<HTMLTextAreaElement>('message');
const profileSelect = requireElement<HTMLSelectElement>('profile');
const estimateText = requireElement<HTMLParagraphElement>('send-estimate');
const pulsePreview = requireElement<HTMLDivElement>('pulse-preview');
const pulseScreen = requireElement<HTMLDivElement>('pulse-screen');
const pulseOverlayLabel = requireElement<HTMLDivElement>('pulse-overlay-label');
const frameStatus = requireElement<HTMLParagraphElement>('frame-status');
const preview = requireElement<HTMLVideoElement>('preview');
const receiveStatus = requireElement<HTMLParagraphElement>('receive-status');
const receiveProgress = requireElement<HTMLProgressElement>('receive-progress');
const lumaMeter = requireElement<HTMLSpanElement>('luma-meter');
const lumaStatus = requireElement<HTMLParagraphElement>('luma-status');
const decodedMessage = requireElement<HTMLPreElement>('decoded-message');
const decodedMeta = requireElement<HTMLParagraphElement>('decoded-meta');
const receiver = new PulseReceiver();

let activeTimeout: number | undefined;
let activeTransmission: Transmission | undefined;
let activeSymbolCount = 0;
let activeTransmissionStartedAt = 0;
let transmissionToken = 0;
let selectedMessageKind: MessageKind = 'text';

init();

function init(): void {
  renderProfiles();
  renderTemplates();
  renderInbox();
  void renderDiagnostics();
  bindEvents();
  registerServiceWorker();
}

function bindEvents(): void {
  requireElement<HTMLButtonElement>('start-send').addEventListener('click', () => {
    try {
      const bundle = createMessageBundle(messageInput.value, selectedMessageKind);
      startTransmission(bundle, profileSelect.value as ProfileId);
    } catch (error) {
      frameStatus.textContent = error instanceof Error ? error.message : 'Unable to start transmission.';
    }
  });

  requireElement<HTMLButtonElement>('stop-send').addEventListener('click', stopTransmission);
  requireElement<HTMLButtonElement>('stop-overlay').addEventListener('click', stopTransmission);
  messageInput.addEventListener('input', () => {
    selectedMessageKind = 'text';
    updateEstimate();
  });
  profileSelect.addEventListener('change', updateEstimate);

  requireElement<HTMLButtonElement>('start-receive').addEventListener('click', () => {
    void startReceiving();
  });
  requireElement<HTMLButtonElement>('stop-receive').addEventListener('click', () => {
    receiver.stop();
    receiveStatus.textContent = 'Camera stopped.';
  });
  requireElement<HTMLButtonElement>('clear-inbox').addEventListener('click', () => {
    clearInbox();
    renderInbox();
  });
  requireElement<HTMLButtonElement>('refresh-diagnostics').addEventListener('click', () => {
    void renderDiagnostics();
  });
}

function renderProfiles(): void {
  profileSelect.innerHTML = Object.values(PROFILES)
    .map((profile) => `<option value="${profile.id}">${profile.name} - ${profile.rangeHint}</option>`)
    .join('');
  profileSelect.value = 'balanced';
}

function renderTemplates(): void {
  const container = requireElement<HTMLDivElement>('templates');
  container.replaceChildren(
    ...MESSAGE_TEMPLATES.map((template) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'template';
      button.textContent = template.label;
      button.addEventListener('click', () => {
        selectedMessageKind = template.kind;
        messageInput.value = template.body;
        updateEstimate();
      });
      return button;
    }),
  );
}

function updateEstimate(): void {
  const body = messageInput.value.trim();
  if (!body) {
    estimateText.textContent = 'Choose a message to estimate transmission time.';
    return;
  }

  try {
    const bundle = createMessageBundle(body, selectedMessageKind);
    const transmission = createTransmission(bundle, profileSelect.value as ProfileId);
    estimateText.textContent = `${byteLength(body)} bytes · ${transmission.symbols.length} light pulse(s) · about ${estimateDurationSeconds(transmission)} second(s) per repeat.`;
  } catch (error) {
    estimateText.textContent = error instanceof Error ? error.message : 'Unable to estimate transmission time.';
  }
}

function startTransmission(bundle: MessageBundle, profileId: ProfileId): void {
  stopTransmission();
  activeTransmission = createTransmission(bundle, profileId);
  activeSymbolCount = 0;
  activeTransmissionStartedAt = performance.now();
  transmissionToken += 1;
  const token = transmissionToken;
  pulseScreen.classList.add('active');
  frameStatus.textContent = 'Starting full-screen pulse train...';
  runTransmissionLoop(token);
}

function stopTransmission(): void {
  transmissionToken += 1;
  if (activeTimeout !== undefined) {
    window.clearTimeout(activeTimeout);
    activeTimeout = undefined;
  }
  pulseScreen.classList.remove('active', 'one', 'zero');
  pulseScreen.style.backgroundColor = '';
  pulsePreview.classList.remove('one', 'zero');
  frameStatus.textContent = activeTransmission ? 'Transmission stopped.' : 'Full-screen pulses appear when sending starts.';
}

function runTransmissionLoop(token: number): void {
  if (!activeTransmission || token !== transmissionToken) {
    return;
  }

  const delay = activeTransmission.profile.symbolMs;
  const expectedSymbolCount = Math.floor((performance.now() - activeTransmissionStartedAt) / delay);
  if (expectedSymbolCount > activeSymbolCount) {
    activeSymbolCount = expectedSymbolCount;
  }

  showNextSymbol(token);
  if (activeTransmission && token === transmissionToken) {
    const nextSymbolAt = activeTransmissionStartedAt + activeSymbolCount * delay;
    activeTimeout = window.setTimeout(() => {
      runTransmissionLoop(token);
    }, Math.max(0, nextSymbolAt - performance.now()));
  }
}

function showNextSymbol(token: number): void {
  const transmission = activeTransmission;
  if (!transmission || token !== transmissionToken) {
    return;
  }

  const displayedIndex = activeSymbolCount % transmission.symbols.length;
  const symbol = transmission.symbols[displayedIndex];
  activeSymbolCount += 1;
  setPulseSymbol(symbol);
  if (token === transmissionToken) {
    const label = `${formatSymbolLabel(transmission, displayedIndex)} · ${transmission.profile.description}`;
    frameStatus.textContent = label;
    pulseOverlayLabel.textContent = label;
  }
}

async function startReceiving(): Promise<void> {
  receiveStatus.textContent = 'Requesting camera permission...';
  receiveProgress.value = 0;
  receiveProgress.max = 1;

  try {
    await receiver.start(preview, (update) => {
      receiveStatus.textContent = update.status;
      receiveProgress.max = 1;
      receiveProgress.value = update.progress ?? 0;
      lumaMeter.style.width = `${Math.max(0, Math.min(100, (update.luma / 255) * 100))}%`;
      lumaStatus.textContent = `Brightness ${Math.round(update.luma)} · signal range ${Math.round(update.signalRange)} · samples ${update.sampleCount}`;
      if (update.bundle) {
        decodedMessage.textContent = update.bundle.body;
        decodedMeta.textContent = `${update.bundle.kind} · ${new Date(update.bundle.createdAt).toLocaleString()} · ${update.bundle.hopsRemaining} relay hop(s) left`;
        saveToInbox(update.bundle);
        renderInbox();
      }
    });
  } catch (error) {
    receiveStatus.textContent = error instanceof Error ? error.message : 'Unable to start camera.';
  }
}

function renderInbox(): void {
  const inbox = requireElement<HTMLDivElement>('inbox');
  let bundles: MessageBundle[];
  try {
    bundles = loadInbox();
  } catch (error) {
    inbox.textContent = error instanceof Error ? error.message : 'Unable to read inbox.';
    return;
  }

  if (!bundles.length) {
    inbox.innerHTML = '<p class="muted">Received messages will appear here. Relay mode lets another phone retransmit them from its own screen.</p>';
    return;
  }

  inbox.replaceChildren(
    ...bundles.map((bundle) => {
      const item = document.createElement('article');
      item.className = 'inbox-item';

      const title = document.createElement('h3');
      title.textContent = bundle.title ?? bundle.kind.toUpperCase();

      const body = document.createElement('p');
      body.textContent = bundle.body;

      const meta = document.createElement('p');
      meta.className = 'muted';
      meta.textContent = `${new Date(bundle.createdAt).toLocaleString()} · ${bundle.hopsRemaining} hop(s) left`;

      const button = document.createElement('button');
      button.textContent = bundle.hopsRemaining > 0 ? 'Relay this message' : 'No hops left';
      button.disabled = bundle.hopsRemaining <= 0;
      button.addEventListener('click', () => {
        try {
          const relayBundle = createRelayBundle(bundle);
          messageInput.value = relayBundle.body;
          location.hash = '#send';
          startTransmission(relayBundle, 'beacon');
        } catch (error) {
          frameStatus.textContent = error instanceof Error ? error.message : 'Unable to relay this message.';
        }
      });

      item.append(title, body, meta, button);
      return item;
    }),
  );
}

async function renderDiagnostics(): Promise<void> {
  const list = requireElement<HTMLDivElement>('diagnostics-list');
  try {
    const diagnostics = await collectDiagnostics();
    list.replaceChildren(
      ...diagnostics.map((item) => {
        const row = document.createElement('div');
        row.className = item.ok ? 'diagnostic ok' : 'diagnostic bad';
        row.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
        return row;
      }),
    );
  } catch (error) {
    list.textContent = error instanceof Error ? error.message : 'Unable to collect diagnostics.';
  }
}

function registerServiceWorker(): void {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('./sw.js');
    });
  }
}

function setPulseSymbol(symbol: PulseSymbol): void {
  pulseScreen.classList.toggle('one', symbol === '1');
  pulseScreen.classList.toggle('zero', symbol === '0');
  pulsePreview.classList.toggle('one', symbol === '1');
  pulsePreview.classList.toggle('zero', symbol === '0');
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element #${id}`);
  }
  return element as T;
}
