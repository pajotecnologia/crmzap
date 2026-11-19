import { getBackendUrl } from "../../config";

export const LOCAL_ADMIN_EMAIL = "admin@local.dev";
export const LOCAL_ADMIN_PASSWORD = "123456";

const DB_KEY = "local_db_v1";
const SESSION_KEY = "local_session_user_id";
const LOCAL_TOKEN = "local-session-token";

export function isLocalMode() {
  const raw =
    (typeof window !== "undefined" && window.ENV && window.ENV.REACT_APP_LOCAL_MODE) ||
    process.env.REACT_APP_LOCAL_MODE ||
    "";
  return String(raw).trim().toLowerCase() === "true";
}

const nowIso = () => new Date().toISOString();

const FULL_PLAN = {
  id: 1,
  name: "Plano Local",
  users: 9999,
  connections: 9999,
  queues: 9999,
  amount: "0",
  useWhatsapp: true,
  useWhatsappOfficial: true,
  useFacebook: true,
  useInstagram: true,
  useCampaigns: true,
  useSchedules: true,
  useInternalChat: true,
  useExternalApi: true,
  useKanban: true,
  useOpenAi: true,
  useIntegrations: true,
  isPublic: false
};

const DEFAULT_SETTINGS = [
  ["userCreation", "enabled"],
  ["hoursCloseTicketsAuto", "9999999999"],
  ["chatBotType", "text"],
  ["acceptCallWhatsapp", "enabled"],
  ["userRandom", "enabled"],
  ["sendGreetingMessageOneQueues", "enabled"],
  ["sendSignMessage", "enabled"],
  ["sendFarewellWaitingTicket", "disabled"],
  ["userRating", "disabled"],
  ["sendGreetingAccepted", "enabled"],
  ["CheckMsgIsGroup", "enabled"],
  ["sendQueuePosition", "enabled"],
  ["scheduleType", "disabled"],
  ["acceptAudioMessageContact", "enabled"],
  ["enableLGPD", "disabled"],
  ["requiredTag", "disabled"],
  ["enabledLanguages", '["pt-BR","en","es","ar"]']
];

function buildSeed() {
  const createdAt = nowIso();
  const company = {
    id: 1,
    name: "Empresa Local",
    email: LOCAL_ADMIN_EMAIL,
    phone: "",
    status: true,
    planId: 1,
    dueDate: "2999-12-31T00:00:00.000Z",
    recurrence: "MENSAL",
    createdAt,
    updatedAt: createdAt
  };
  const user = {
    id: 1,
    name: "Administrador",
    email: LOCAL_ADMIN_EMAIL,
    password: LOCAL_ADMIN_PASSWORD,
    profile: "admin",
    super: true,
    companyId: 1,
    online: true,
    language: "pt-BR",
    allTicket: "enable",
    allHistoric: "enabled",
    allUserChat: "enabled",
    showDashboard: "enabled",
    showContacts: "enabled",
    showCampaign: "enabled",
    showFlow: "enabled",
    allowRealTime: "enabled",
    allowConnections: "enabled",
    allowGroup: true,
    userClosePendingTicket: "enabled",
    defaultTicketsManagerWidth: 550,
    profileImage: "",
    createdAt,
    updatedAt: createdAt
  };
  return {
    seq: 1000,
    collections: {
      companies: [company],
      users: [user],
      plans: [{ ...FULL_PLAN, createdAt, updatedAt: createdAt }],
      settings: DEFAULT_SETTINGS.map(([key, value], i) => ({
        id: i + 1,
        key,
        value,
        companyId: 1,
        createdAt,
        updatedAt: createdAt
      }))
    }
  };
}

let cache = null;

function loadDb() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.collections) {
        cache = parsed;
        return cache;
      }
    }
  } catch {
    /* recria abaixo */
  }
  cache = buildSeed();
  saveDb();
  return cache;
}

function saveDb() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(cache));
  } catch {
    /* quota excedida: mantém em memória */
  }
}

function collection(name) {
  const db = loadDb();
  if (!Array.isArray(db.collections[name])) db.collections[name] = [];
  return db.collections[name];
}

function nextId() {
  const db = loadDb();
  db.seq = (Number(db.seq) || 1000) + 1;
  return db.seq;
}

const COUNT_KEYS = new Set([
  "count",
  "total",
  "totalCount",
  "totalRecords",
  "totalItems",
  "totalPages",
  "length"
]);
const NON_LIST_PLURALS = new Set([
  "status",
  "success",
  "hasMore",
  "address",
  "alias",
  "previous",
  "progress",
  "bonus",
  "canvas",
  "focus",
  "props",
  "isActive",
  "class",
  "process"
]);

function looksLikeList(prop) {
  if (NON_LIST_PLURALS.has(prop)) return false;
  return /s$/.test(prop) || /(List|Items|Data|Rows|Records|Results)$/.test(prop) || prop === "data" || prop === "rows" || prop === "list";
}

/**
 * Envolve respostas para que páginas que esperam formatos diferentes
 * ({ contacts, hasMore }, arrays, { count }) funcionem sem backend.
 */
function smart(target, items) {
  const list = items || (Array.isArray(target) ? target : []);
  return new Proxy(target, {
    get(obj, prop, receiver) {
      if (typeof prop === "symbol" || Reflect.has(obj, prop)) {
        return Reflect.get(obj, prop, receiver);
      }
      if (prop === "hasMore") return false;
      if (COUNT_KEYS.has(prop)) return list.length;
      if (prop === "page" || prop === "pageNumber" || prop === "currentPage") return 1;
      if (looksLikeList(prop)) return list;
      return undefined;
    }
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value === undefined ? null : value));
}

function parseBody(data) {
  if (data == null) return {};
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    const out = {};
    data.forEach((value, key) => {
      if (typeof File !== "undefined" && value instanceof File) return;
      out[key] = value;
    });
    return out;
  }
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }
  return typeof data === "object" ? data : {};
}

function normalizePath(url) {
  let path = String(url || "");
  const base = getBackendUrl();
  if (path.startsWith(base)) path = path.slice(base.length);
  path = path.replace(/^https?:\/\/[^/]+/i, "");
  path = path.split("?")[0].split("#")[0];
  return path.replace(/\/+$/, "").replace(/^\/+/, "");
}

function stripPassword(user) {
  if (!user) return user;
  const { password, ...rest } = user;
  return rest;
}

function currentUser() {
  const id = Number(localStorage.getItem(SESSION_KEY));
  if (!id) return null;
  return collection("users").find((u) => Number(u.id) === id) || null;
}

function companyWithPlan(companyId) {
  const company =
    collection("companies").find((c) => Number(c.id) === Number(companyId)) ||
    collection("companies")[0];
  const plan =
    collection("plans").find((p) => Number(p.id) === Number(company?.planId)) || FULL_PLAN;
  return { ...company, plan };
}

function base64Url(obj) {
  return btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function localToken(user) {
  const header = base64Url({ alg: "none", typ: "JWT" });
  const payload = base64Url({
    id: user.id,
    username: user.name,
    profile: user.profile,
    companyId: user.companyId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365
  });
  return `${header}.${payload}.${LOCAL_TOKEN}`;
}

function sessionPayload(user) {
  const company = companyWithPlan(user.companyId);
  return {
    token: localToken(user),
    user: {
      ...stripPassword(user),
      company: { ...company, companieSettings: [] },
      queues: [],
      whatsapp: null
    }
  };
}

class LocalHttpError extends Error {
  constructor(status, error) {
    super(error);
    this.status = status;
    this.payload = { error };
  }
}

function filterList(items, params) {
  let out = items;
  const search = params && (params.searchParam || params.search || params.q);
  if (search) {
    const term = String(search).toLowerCase();
    out = out.filter((item) => JSON.stringify(item).toLowerCase().includes(term));
  }
  const page = Number(params && (params.pageNumber || params.page));
  if (page > 1) return [];
  return out;
}

function handleAuth(method, parts, body) {
  const action = parts[1];
  if (action === "login" && method === "post") {
    const email = String(body.email || "").trim().toLowerCase();
    const user = collection("users").find(
      (u) => String(u.email).toLowerCase() === email && String(u.password) === String(body.password)
    );
    if (!user) throw new LocalHttpError(401, "ERR_INVALID_CREDENTIALS");
    localStorage.setItem(SESSION_KEY, String(user.id));
    return sessionPayload(user);
  }
  if (action === "refresh_token") {
    const user = currentUser();
    if (!user) throw new LocalHttpError(401, "ERR_SESSION_EXPIRED");
    return sessionPayload(user);
  }
  if (action === "me") {
    const user = currentUser();
    if (!user) throw new LocalHttpError(401, "ERR_SESSION_EXPIRED");
    return sessionPayload(user).user;
  }
  if (action === "logout") {
    localStorage.removeItem(SESSION_KEY);
    return {};
  }
  if (action === "google") return { configured: false };
  return {};
}

function handleSettings(method, parts, body) {
  const settings = collection("settings");
  const key = parts[1];
  if (method === "get") {
    if (!key) return smart(plain(settings));
    const found = settings.find((s) => s.key === key);
    return found ? plain(found) : { key, value: "" };
  }
  if (key && (method === "put" || method === "post" || method === "patch")) {
    const value = body.value !== undefined ? body.value : body[key];
    const found = settings.find((s) => s.key === key);
    if (found) {
      found.value = value;
      found.updatedAt = nowIso();
    } else {
      settings.push({ id: nextId(), key, value, companyId: 1, createdAt: nowIso(), updatedAt: nowIso() });
    }
    saveDb();
    return { key, value };
  }
  return {};
}

const PLAN_BOOLEAN_FIELDS = [
  "useWhatsapp",
  "useWhatsappOfficial",
  "useFacebook",
  "useInstagram",
  "useCampaigns",
  "useSchedules",
  "useInternalChat",
  "useExternalApi",
  "useKanban",
  "useOpenAi",
  "useIntegrations",
  "wavoip",
  "isPublic",
  "trial"
];
const PLAN_NUMBER_FIELDS = ["users", "connections", "queues", "trialDays"];

function toBool(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function sanitizePlan(body, existing = {}) {
  const out = { ...existing };
  if (body.name !== undefined) out.name = String(body.name || "").trim();
  PLAN_NUMBER_FIELDS.forEach((f) => {
    if (body[f] !== undefined) out[f] = Math.max(0, parseInt(body[f], 10) || 0);
  });
  PLAN_BOOLEAN_FIELDS.forEach((f) => {
    if (body[f] !== undefined) out[f] = toBool(body[f]);
  });
  if (body.amount !== undefined) {
    const n = parseFloat(String(body.amount).replace(",", "."));
    out.amount = Number.isFinite(n) && n >= 0 ? n.toFixed(2) : "0";
  }
  if (body.recurrence !== undefined) out.recurrence = String(body.recurrence || "monthly");
  return out;
}

function assertPlansAdmin() {
  const user = currentUser();
  if (!user || String(user.email).toLowerCase() !== LOCAL_ADMIN_EMAIL) {
    throw new LocalHttpError(403, "ERR_NO_PERMISSION");
  }
}

function assertUniquePlanName(name, ignoreId) {
  if (!name || name.length < 2) throw new LocalHttpError(400, "ERR_PLAN_INVALID_NAME");
  const clash = collection("plans").find(
    (p) => String(p.name).trim().toLowerCase() === name.toLowerCase() && String(p.id) !== String(ignoreId)
  );
  if (clash) throw new LocalHttpError(400, "ERR_PLAN_NAME_ALREADY_EXISTS");
}

function handlePlans(method, parts, body, params) {
  const plans = collection("plans");
  const sub = parts[1];
  if (method === "get") {
    if (!sub || sub === "all" || sub === "list") return smart(plain(plans));
    const found = plans.find((p) => String(p.id) === String(sub));
    if (!found) throw new LocalHttpError(404, "ERR_NO_PLAN_FOUND");
    return plain(found);
  }
  assertPlansAdmin();
  if (method === "post" && !sub) {
    const record = sanitizePlan(body, {
      users: 0,
      connections: 0,
      queues: 0,
      amount: "0",
      trialDays: 3,
      recurrence: "monthly",
      isPublic: true,
      trial: false
    });
    assertUniquePlanName(record.name);
    const now = nowIso();
    const created = { ...record, id: nextId(), createdAt: now, updatedAt: now };
    plans.push(created);
    saveDb();
    return plain(created);
  }
  const idx = plans.findIndex((p) => String(p.id) === String(sub));
  if (idx < 0) throw new LocalHttpError(404, "ERR_NO_PLAN_FOUND");
  if (method === "put" || method === "patch") {
    const updated = sanitizePlan(body, plans[idx]);
    assertUniquePlanName(updated.name, plans[idx].id);
    plans[idx] = { ...updated, id: plans[idx].id, updatedAt: nowIso() };
    saveDb();
    return plain(plans[idx]);
  }
  if (method === "delete") {
    const inUse = collection("companies").some((c) => String(c.planId) === String(plans[idx].id));
    if (inUse) throw new LocalHttpError(400, "ERR_PLAN_IN_USE");
    plans.splice(idx, 1);
    saveDb();
    return {};
  }
  return handleGeneric(method, parts, body, params);
}

function handleGeneric(method, parts, body, params) {
  const [name, rawId, ...rest] = parts;
  const items = collection(name);
  const id = rawId !== undefined && /^\d+$/.test(rawId) ? Number(rawId) : rawId;
  const findIndex = () => items.findIndex((i) => String(i.id) === String(id));

  if (method === "get") {
    if (rest.length) return smart([]);
    if (rawId === undefined || typeof id === "string") {
      return smart(plain(filterList(items, params)));
    }
    const idx = findIndex();
    if (idx >= 0) return smart(plain(items[idx]), []);
    return smart({ id }, []);
  }

  if (method === "post") {
    if (rawId !== undefined && rest.length) return smart({ ...body, id }, []);
    const record = { ...body, id: nextId(), companyId: body.companyId || 1, createdAt: nowIso(), updatedAt: nowIso() };
    items.unshift(record);
    saveDb();
    return smart(plain(record), []);
  }

  if (method === "put" || method === "patch") {
    if (rawId === undefined) return smart({ ...body }, []);
    const idx = findIndex();
    if (idx >= 0 && !rest.length) {
      items[idx] = { ...items[idx], ...body, id: items[idx].id, updatedAt: nowIso() };
      saveDb();
      return smart(plain(items[idx]), []);
    }
    return smart({ ...body, id }, []);
  }

  if (method === "delete") {
    if (rawId === undefined) {
      items.splice(0, items.length);
    } else {
      const idx = findIndex();
      if (idx >= 0 && !rest.length) items.splice(idx, 1);
    }
    saveDb();
    return {};
  }
  return {};
}

export function handleLocalRequest({ method = "get", url = "", data, params }) {
  const m = String(method).toLowerCase();
  const path = normalizePath(url);
  const parts = path.split("/").filter(Boolean);
  const body = parseBody(data);
  const head = parts[0] || "";
  if (head === "auth") return handleAuth(m, parts, body);
  if (head === "settings" || head === "setting") return handleSettings(m, parts, body);
  if (head === "public-settings") {
    const found = collection("settings").find((s) => s.key === parts[1]);
    return found ? found.value : null;
  }
  if (head === "version") return { version: "local" };
  if (head === "companies" && parts[1] === "listPlan") return { ...companyWithPlan(parts[2] || 1) };
  if (head === "public" && parts[1] === "plans") return smart(plain(collection("plans")));
  if (head === "plans") return handlePlans(m, parts, body, params || {});
  if (head === "companySettings" && m === "get") return smart({}, []);
  if (head === "users" && parts[1] && /^\d+$/.test(parts[1]) && m === "get") {
    const u = collection("users").find((x) => String(x.id) === parts[1]);
    if (u) return smart(stripPassword(plain(u)), []);
  }
  if (head === "users" && m === "get" && !parts[1]) {
    return smart(plain(collection("users").map(stripPassword)));
  }

  return handleGeneric(m, parts, body, params || {});
}

function isBackendUrl(url) {
  const s = String(url || "");
  if (!/^https?:\/\//i.test(s)) return true;
  return s.startsWith(getBackendUrl());
}

export function localAxiosAdapter(config) {
  return new Promise((resolve, reject) => {
    const fullUrl = config.baseURL && !/^https?:\/\//i.test(config.url || "")
      ? `${String(config.baseURL).replace(/\/+$/, "")}/${String(config.url || "").replace(/^\/+/, "")}`
      : config.url;
    let payload;
    try {
      payload = handleLocalRequest({
        method: config.method,
        url: fullUrl,
        data: config.data,
        params: config.params
      });
    } catch (err) {
      const status = err.status || 500;
      const error = new Error(err.message || "Request failed");
      error.config = config;
      error.response = { status, statusText: String(status), data: err.payload || { error: err.message }, headers: {}, config };
      error.isAxiosError = true;
      setTimeout(() => reject(error), 30);
      return;
    }
    setTimeout(
      () =>
        resolve({
          data: payload,
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          config,
          request: {}
        }),
      30
    );
  });
}

export function createLocalSocket() {
  const noop = () => {};
  return {
    connected: false,
    on: noop,
    off: noop,
    once: noop,
    emit: noop,
    connect: noop,
    disconnect: noop,
    removeAllListeners: noop
  };
}

let installed = false;

export function installLocalMode(axiosInstances = []) {
  if (!isLocalMode()) return;
  axiosInstances.forEach((instance) => {
    if (instance && instance.defaults) instance.defaults.adapter = localAxiosAdapter;
  });
  if (installed || typeof window === "undefined") return;
  installed = true;
  loadDb();
  const originalFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!originalFetch) return;
  window.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input && input.url;
    const base = getBackendUrl();
    if (url && String(url).startsWith(base) && isBackendUrl(url)) {
      try {
        const payload = handleLocalRequest({ method: init.method || "get", url, data: init.body });
        return new Response(JSON.stringify(payload ?? null), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify(err.payload || {}), {
          status: err.status || 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    return originalFetch(input, init);
  };
}
