/* AxiomPilotCode browser-side profile and encrypted offline inbox.
 * Private RSA key and downloaded chats stay in this browser (IndexedDB).
 * The server handles only authenticated encrypted envelopes and public keys.
 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const baseURL = String(window.AXIOM_ACCOUNT_API?.baseURL || '').replace(/\/$/, '');
  const bridgeURL = baseURL.replace(/\/axiom-account$/, '/axiom-bridge');
  const storageKey = 'axiom-account-session-v1';
  const lastUserKey = 'axiom-offline-last-user-v1';
  const databaseName = 'axiom-offline-profile-v1';
  const textEncoder = new TextEncoder();
  const textDecoder = new TextDecoder();
  let active = null;
  let dbPromise = null;
  let offline = false;
  let syncing = false;

  function tell(message, kind = 'info') {
    const box = $('profile-alert');
    box.textContent = message;
    box.dataset.kind = kind;
    box.hidden = !message;
  }
  function state(name, label) {
    const indicator = $('connection-state');
    indicator.dataset.status = name;
    indicator.textContent = label;
  }
  function sessionToken() {
    try { return sessionStorage.getItem(storageKey) || ''; }
    catch { return ''; }
  }
  function lastUser() {
    try { return localStorage.getItem(lastUserKey) || ''; }
    catch { return ''; }
  }
  function saveLastUser(id) {
    try {
      if (id) localStorage.setItem(lastUserKey, id);
      else localStorage.removeItem(lastUserKey);
    } catch { /* storage unavailable */ }
  }

  function database() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys', { keyPath: 'userId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return dbPromise;
  }
  async function readStore(storeName, key) {
    const db = await database();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function putStore(storeName, value) {
    const db = await database();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(value);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function deleteStore(storeName, key) {
    const db = await database();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  async function api(route, options = {}) {
    if (!sessionToken()) throw new Error('Для этого действия нужно войти в аккаунт.');
    const response = await fetch((route.startsWith('/api/auth/') ? baseURL : bridgeURL) + route, {
      method: options.method || 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        'Authorization': 'Bearer ' + sessionToken(),
        'Content-Type': 'application/json'
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || data.error || 'Ошибка API: ' + response.status);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  const b64ToBytes = text => {
    const base = text.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base);
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  };
  function validateSnapshot(payload) {
    if (!payload || payload.schema !== 1 ||
        !Array.isArray(payload.modules) || !Array.isArray(payload.chats))
      throw new Error('Пакет синхронизации имеет неверный формат.');
    if (payload.modules.length > 60 || payload.chats.length > 50)
      throw new Error('Слишком большой пакет истории.');
    const cleanText = (v, cap) => typeof v === 'string' ? v.slice(0, cap) : '';
    const modules = payload.modules.map((item, index) => ({
      id: cleanText(item?.id, 100) || 'module-' + index,
      name: cleanText(item?.name, 100) || 'Модуль',
      version: cleanText(item?.version, 50),
      source: cleanText(item?.source, 90)
    }));
    const chats = payload.chats.map((chat, index) => ({
      id: cleanText(chat?.id, 80) || 'chat-' + index,
      title: cleanText(chat?.title, 130) || 'Чат',
      model: cleanText(chat?.model, 110),
      date: cleanText(chat?.date, 40),
      messages: Array.isArray(chat?.messages) ?
        chat.messages.slice(-70).map(m => ({
          role: ['user', 'assistant'].includes(m?.role) ? m.role : 'system',
          content: cleanText(m?.content, 12000)
        })).filter(m => m.role !== 'system' && m.content) : []
    }));
    return { modules, chats };
  }

  async function ensureBrowserKey() {
    if (!globalThis.crypto?.subtle) throw new Error('Для защищённой синхронизации необходим HTTPS и Web Crypto.');
    let pair = await readStore('keys', active.id);
    let remote;
    try { remote = await api('/api/sync/key'); }
    catch (error) {
      if (error.status !== 404) throw error;
      remote = { publicKey: null };
    }
    if (pair && remote.publicKey) {
      if (pair.publicKey.n !== remote.publicKey.n || pair.publicKey.e !== remote.publicKey.e)
        throw new Error('На сервере указан ключ другого браузера. Здесь обновления нельзя расшифровать. Старые данные сохранены.');
      return pair;
    }
    if (!pair && remote.publicKey) {
      tell('Аккаунт уже связан с другим браузером. Текущий браузер не имеет закрытого ключа — синхронизация недоступна, но локальные данные можно просматривать.', 'error');
      return null;
    }
    if (!pair) {
      const generated = await crypto.subtle.generateKey({
        name: 'RSA-OAEP',
        modulusLength: 3072,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256'
      }, false, ['encrypt', 'decrypt']);
      pair = {
        userId: active.id,
        publicKey: await crypto.subtle.exportKey('jwk', generated.publicKey),
        privateKey: generated.privateKey
      };
      await putStore('keys', pair);
    }
    await api('/api/sync/key', { method: 'POST', body: { publicKey: pair.publicKey } });
    return pair;
  }

  async function decryptEnvelope(envelope, privateKey) {
    if (!envelope || envelope.v !== 1 || envelope.alg !== 'RSA-OAEP-256+A256GCM')
      throw new Error('Неизвестный формат зашифрованного пакета.');
    const aesRaw = await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, b64ToBytes(envelope.ek));
    const aes = await crypto.subtle.importKey('raw', aesRaw, 'AES-GCM', false, ['decrypt']);
    const data = await crypto.subtle.decrypt({
      name: 'AES-GCM',
      iv: b64ToBytes(envelope.iv)
    }, aes, b64ToBytes(envelope.data));
    return validateSnapshot(JSON.parse(textDecoder.decode(data)));
  }

  async function sync() {
    if (syncing || !active || offline || !sessionToken()) return;
    syncing = true;
    const button = $('sync-now');
    button.disabled = true;
    const previous = button.textContent;
    button.textContent = 'Получаем данные…';
    try {
      const pair = await ensureBrowserKey();
      if (!pair) return;
      const incoming = await api('/api/sync/pending');
      const packets = Array.isArray(incoming.packages) ? incoming.packages : [];
      if (!packets.length) {
        tell('Новых данных пока нет. Локальная история доступна без интернета.');
        return;
      }
      const profile = (await readStore('profiles', active.id)) || active;
      const merged = new Map((profile.chats || []).map(c => [c.id, c]));
      const acknowledged = [];
      for (const item of packets) {
        try {
          const decrypted = await decryptEnvelope(item.envelope, pair.privateKey);
          for (const chat of decrypted.chats) merged.set(chat.id, chat);
          profile.modules = decrypted.modules;
          profile.chats = [...merged.values()].slice(-100);
          profile.lastSync = new Date().toISOString();
          await putStore('profiles', profile);
          acknowledged.push(item.id);
        } catch (error) {
          // Do not acknowledge or delete a packet that was not durably cached.
          tell('Не удалось открыть один из пакетов: ' + error.message, 'error');
        }
      }
      if (acknowledged.length)
        await api('/api/sync/ack', { method: 'POST', body: { ids: acknowledged } });
      active = profile;
      render();
      if (acknowledged.length) tell('Получены и сохранены пакеты: ' + acknowledged.length + '. Можно работать офлайн.', 'success');
    } catch (error) {
      tell('Не удалось синхронизировать: ' + error.message, 'error');
    } finally {
      syncing = false;
      button.disabled = offline;
      button.textContent = previous;
    }
  }

  function textNode(tag, text, className) {
    const node = document.createElement(tag);
    node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function render() {
    if (!active) return;
    $('profile-app').hidden = false;
    $('profile-login-required').hidden = true;
    const label = active.nickname || active.email?.split('@')[0] || 'Участник';
    $('sidebar-name').textContent = label;
    $('sidebar-email').textContent = active.email || 'Офлайн-копия';
    $('sidebar-plan').textContent = active.plan === 'pro' ? 'Pro' : 'Free';
    $('profile-avatar').textContent = label.charAt(0).toUpperCase();
    $('greeting-name').textContent = label;
    $('nickname').value = active.nickname || '';
    const modules = Array.isArray(active.modules) ? active.modules : [];
    const chats = Array.isArray(active.chats) ? active.chats : [];
    $('count-modules').textContent = String(modules.length);
    $('count-chats').textContent = String(chats.length);
    $('last-sync').textContent = active.lastSync ?
      new Date(active.lastSync).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Нет';
    $('sync-now').disabled = offline;
    $('nickname-form').querySelector('button[type="submit"]').disabled = offline;
    renderModules(modules);
    renderChats(chats);
  }
  function renderModules(modules) {
    const list = $('modules-list');
    list.replaceChildren();
    if (!modules.length) {
      list.append(textNode('p', 'Модулей пока нет. После подключения терминала их снимок появится здесь.', 'empty-state'));
      return;
    }
    for (const m of modules) {
      const row = textNode('div', '', 'data-item');
      const left = document.createElement('div');
      left.append(textNode('strong', m.name, 'item-title'),
        textNode('small', m.source || 'Локальный модуль', 'item-meta'));
      row.append(left, textNode('span', m.version || 'Установлен', 'item-tag'));
      list.append(row);
    }
  }
  function renderChats(chats) {
    const list = $('chats-list');
    list.replaceChildren();
    if (!chats.length) {
      list.append(textNode('p', 'Чатов пока нет. Синхронизируйте CLI после входа в аккаунт.', 'empty-state'));
      return;
    }
    for (const chat of chats.slice().reverse()) {
      const button = textNode('button', '', 'data-item');
      button.type = 'button';
      const left = document.createElement('span');
      left.append(textNode('strong', chat.title, 'item-title'),
        textNode('small', [chat.model,chat.date].filter(Boolean).join(' · ') || 'Локальный чат', 'item-meta'));
      button.append(left,textNode('span', 'Открыть →', 'item-tag'));
      button.addEventListener('click', () => openChat(chat));
      list.append(button);
    }
  }
  function openChat(chat) {
    const panel = $('chat-detail');
    $('chat-title').textContent = chat.title;
    const messages = $('chat-messages');
    messages.replaceChildren();
    for (const m of chat.messages || []) {
      const bubble = textNode('div', '', 'chat-bubble');
      bubble.dataset.role = m.role;
      bubble.append(textNode('strong', m.role === 'user' ? 'Вы' : 'AxiomPilotCode'),
        textNode('p', m.content));
      messages.append(bubble);
    }
    if (!messages.childElementCount) messages.append(textNode('p','Текст сообщений в этом снимке не передан.','empty-state'));
    panel.hidden = false;
    panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function showSection(section) {
    const selected = ['overview','modules','chats','settings'].includes(section) ? section : 'overview';
    document.querySelectorAll('[data-panel]').forEach(panel => {
      panel.hidden = panel.dataset.panel !== selected;
    });
    document.querySelectorAll('[data-panel-link]').forEach(link => {
      if (link.dataset.panelLink === selected) link.setAttribute('aria-current','page');
      else link.removeAttribute('aria-current');
    });
    $('chat-detail').hidden = true;
  }
  document.querySelectorAll('[data-panel-link]').forEach(link => {
    link.addEventListener('click', () => showSection(link.dataset.panelLink));
  });
  window.addEventListener('hashchange', () => showSection(location.hash.slice(1)));
  $('close-chat').addEventListener('click', () => { $('chat-detail').hidden = true; });
  $('sync-now').addEventListener('click', sync);
  $('nickname-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (offline || !active) return;
    const nickname = $('nickname').value.trim();
    if (nickname.length < 2 || nickname.length > 32 || /[\x00-\x1f\x7f]/.test(nickname)) {
      tell('Никнейм должен содержать 2–32 символа без управляющих символов.', 'error');
      return;
    }
    const button = $('nickname-form').querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const updated = await api('/api/profile', { method: 'PATCH', body: { nickname } });
      active.nickname = updated.nickname;
      await putStore('profiles', active);
      render();
      tell('Никнейм сохранён.', 'success');
    } catch (error) { tell('Ошибка сохранения: ' + error.message, 'error'); }
    finally { button.disabled = offline; }
  });
  $('clear-local').addEventListener('click', async () => {
    if (!active || !confirm('Удалить локальные чаты и модули этого аккаунта из браузера? Ключ синхронизации останется.')) return;
    active.modules = [];
    active.chats = [];
    active.lastSync = null;
    await putStore('profiles', active);
    render();
    tell('Локальная история удалена.', 'success');
  });
  $('profile-signout').addEventListener('click', async () => {
    const token = sessionToken();
    try { if (token) await api('/api/auth/sign-out', { method: 'POST', body: {} }); }
    catch { /* local sign out is still performed */ }
    try { sessionStorage.removeItem(storageKey); } catch {}
    saveLastUser('');
    location.replace('./index.html?login=1');
  });


  function deviceMessage(message, success = false) {
    const el = $('device-status');
    el.textContent = message;
    el.dataset.success = String(success);
  }
  async function loadDevices() {
    if (offline || !sessionToken()) return;
    const container = $('device-token-list');
    try {
      const response = await api('/api/tokens');
      const tokens = Array.isArray(response.tokens) ? response.tokens : [];
      container.replaceChildren();
      const available = tokens.filter(t => !t.revoked_at && Date.parse(t.expires_at) > Date.now());
      if (!available.length) {
        container.append(textNode('p', 'Привязанных терминалов пока нет.', 'empty-state'));
        return;
      }
      for (const item of available) {
        const row = textNode('div', '', 'data-item');
        const left = document.createElement('div');
        left.append(
          textNode('strong', 'Терминал · ' + String(item.id).slice(0, 8), 'item-title'),
          textNode('small', 'Выдан ' + new Date(item.created_at).toLocaleDateString('ru-RU'), 'item-meta')
        );
        const revoke = textNode('button', 'Отозвать', 'btn btn-secondary');
        revoke.type = 'button';
        revoke.addEventListener('click', async () => {
          if (!confirm('Отозвать доступ этого терминала к аккаунту?')) return;
          revoke.disabled = true;
          try {
            await api('/api/tokens?action=revoke', { method: 'POST', body: { tokenId: item.id } });
            await loadDevices();
            tell('Доступ терминала отозван.', 'success');
          } catch (error) {
            revoke.disabled = false;
            tell('Не удалось отозвать доступ: ' + error.message, 'error');
          }
        });
        row.append(left, revoke);
        container.append(row);
      }
    } catch (error) {
      deviceMessage('Не удалось получить список устройств: ' + error.message);
    }
  }
  $('approve-device').addEventListener('click', async () => {
    if (!active || offline || !sessionToken()) return deviceMessage('Для подключения требуется вход в аккаунт и интернет.');
    const code = $('device-user-code').value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code))
      return deviceMessage('Введите код ABCD-EFGH с экрана терминала.');
    const button = $('approve-device');
    button.disabled = true;
    try {
      await api('/api/device?action=approve', { method: 'POST', body: { userCode: code } });
      deviceMessage('Код подтверждён. Вернитесь в CLI и дождитесь завершения входа.', true);
      $('device-user-code').value = '';
      if (new URLSearchParams(location.search).has('device'))
        history.replaceState({}, '', location.pathname + '#settings');
      await loadDevices();
    } catch (error) {
      deviceMessage(error.message || 'Не удалось подтвердить код.');
    } finally { button.disabled = false; }
  });

  async function start() {
    const supplied = new URLSearchParams(location.search).get('device');
    if (supplied && /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/i.test(supplied)) {
      $('device-user-code').value = supplied.toUpperCase();
      showSection('settings');
    } else showSection(location.hash.slice(1));
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./profile-sw.js', { scope: './' }).catch(() => {});
    }
    try {
      const token = sessionToken();
      if (token) {
        try {
          const data = await api('/api/profile');
          if (!data?.id) throw new Error('Неверный ответ сервера.');
          const cached = await readStore('profiles', data.id);
          active = {
            ...(cached || { modules: [], chats: [] }),
            id: data.id, email: data.email, plan: data.plan, nickname: data.nickname || ''
          };
          await putStore('profiles', active);
          saveLastUser(active.id);
          offline = false;
          state('online','Онлайн');
          render();
          await loadDevices();
          await sync();
          return;
        } catch (error) {
          if (error.status === 401) {
            try { sessionStorage.removeItem(storageKey); } catch {}
            saveLastUser('');
          } else {
            tell('Сервер сейчас недоступен. Показываем сохранённые данные браузера.', 'info');
          }
        }
      }
      if (lastUser() && (!navigator.onLine || token)) {
        active = await readStore('profiles', lastUser());
        if (active) {
          offline = true;
          state('offline','Офлайн');
          render();
          return;
        }
      }
      state(navigator.onLine ? 'online':'offline', navigator.onLine ? 'Вход не выполнен' : 'Офлайн');
      $('profile-login-required').hidden = false;
    } catch (error) {
      state('offline','Ошибка локального хранилища');
      tell('Браузер не смог открыть локальное хранилище: ' + error.message, 'error');
      $('profile-login-required').hidden = false;
    }
  }
  start();
})();
