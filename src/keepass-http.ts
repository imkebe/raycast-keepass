import { LocalStorage } from "@raycast/api";

export type Preferences = {
  baseUrl: string;
  apiKey?: string;
};

export type KeepassEntry = {
  uuid?: string;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
};

type KeepassHttpEntry = {
  UUID?: string;
  Uuid?: string;
  Name?: string;
  Title?: string;
  Login?: string;
  Username?: string;
  Password?: string;
  URL?: string;
  Url?: string;
  Notes?: string;
  StringFields?: Record<string, string>;
};

type KeepassHttpResponse = {
  Entries?: KeepassHttpEntry[];
  entries?: KeepassEntry[];
  Key?: string;
  key?: string;
  Success?: boolean;
  Error?: string;
};

const STORAGE_KEY = "keepass-http-shared-key";

function requireBaseUrl(preferences: Preferences): string {
  const baseUrl = preferences.baseUrl.trim();
  if (!baseUrl) {
    throw new Error("Missing KeePass HTTP server URL.");
  }

  return baseUrl;
}

async function sendRequest<T extends KeepassHttpResponse>(
  baseUrl: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }

  return (await response.json()) as T;
}

function mapEntry(entry: KeepassHttpEntry): KeepassEntry {
  const stringFields = entry.StringFields ?? {};
  return {
    uuid: entry.UUID ?? entry.Uuid,
    title: entry.Title ?? entry.Name ?? "Untitled",
    username:
      entry.Username ?? entry.Login ?? stringFields.UserName ?? stringFields.username ?? undefined,
    password: entry.Password ?? stringFields.Password ?? undefined,
    url: entry.Url ?? entry.URL,
    notes: entry.Notes,
  };
}

async function getSharedKey(): Promise<string | null> {
  const key = await LocalStorage.getItem<string>(STORAGE_KEY);
  if (typeof key === "string" && key.trim()) {
    return key;
  }
  return null;
}

async function setSharedKey(key: string): Promise<void> {
  await LocalStorage.setItem(STORAGE_KEY, key);
}

export function createKeepassHttpClient(preferences: Preferences) {
  const baseUrl = requireBaseUrl(preferences);

  async function associate(): Promise<string> {
    const response = await sendRequest<KeepassHttpResponse>(baseUrl, {
      RequestType: "associate",
    });

    const key = response.Key ?? response.key;
    if (!key) {
      throw new Error("KeePass HTTP associate did not return a shared key.");
    }

    await setSharedKey(key);
    return key;
  }

  async function ensureKey(): Promise<string> {
    const existing = await getSharedKey();
    if (existing) {
      return existing;
    }
    return associate();
  }

  async function testAssociate(): Promise<void> {
    const key = await ensureKey();
    const response = await sendRequest<KeepassHttpResponse>(baseUrl, {
      RequestType: "test-associate",
      Key: key,
    });

    if (response.Success === false) {
      throw new Error(response.Error ?? "KeePass HTTP association test failed.");
    }
  }

  async function getLogins(query: string): Promise<KeepassEntry[]> {
    const key = await ensureKey();
    const payload: Record<string, unknown> = {
      RequestType: "get-logins",
      Key: key,
    };

    if (query.trim()) {
      payload.Search = query.trim();
    }

    const response = await sendRequest<KeepassHttpResponse>(baseUrl, payload);
    if (Array.isArray(response.entries)) {
      return response.entries;
    }

    const entries = response.Entries ?? [];
    return entries.map(mapEntry);
  }

  return {
    testAssociate,
    getLogins,
  };
}
