import {
  Action,
  ActionPanel,
  Icon,
  List,
  Toast,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import { useEffect, useMemo, useRef, useState } from "react";

type Preferences = {
  baseUrl: string;
  apiKey?: string;
};

type KeepassEntry = {
  uuid?: string;
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
};

type KeepassResponse = {
  entries?: KeepassEntry[];
};

const SEARCH_DEBOUNCE_MS = 250;

async function fetchEntries(query: string, preferences: Preferences): Promise<KeepassEntry[]> {
  const baseUrl = preferences.baseUrl.trim();
  if (!baseUrl) {
    throw new Error("Missing KeePass HTTP server URL.");
  }

  const url = new URL("/entries", baseUrl);
  if (query.trim()) {
    url.searchParams.set("query", query.trim());
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (preferences.apiKey) {
    headers.Authorization = `Bearer ${preferences.apiKey}`;
  }

  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}`);
  }

  const data = (await response.json()) as KeepassResponse | KeepassEntry[];
  if (Array.isArray(data)) {
    return data;
  }

  return data.entries ?? [];
}

export default function Command() {
  const preferences = useMemo(() => getPreferenceValues<Preferences>(), []);
  const [searchText, setSearchText] = useState("");
  const [entries, setEntries] = useState<KeepassEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await fetchEntries(searchText, preferences);
        setEntries(results);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load entries.";
        await showToast({
          style: Toast.Style.Failure,
          title: "KeePass HTTP Error",
          message,
        });
        setEntries([]);
      } finally {
        setIsLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [preferences, searchText]);

  return (
    <List
      isLoading={isLoading}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search KeePass entries"
      throttle
    >
      {entries.map((entry) => (
        <List.Item
          key={entry.uuid ?? `${entry.title}-${entry.username ?? "unknown"}`}
          title={entry.title}
          subtitle={entry.username}
          accessories={entry.url ? [{ icon: Icon.Globe, text: entry.url }] : []}
          actions={
            <ActionPanel>
              {entry.password ? (
                <Action.CopyToClipboard title="Copy Password" content={entry.password} />
              ) : null}
              {entry.username ? (
                <Action.CopyToClipboard title="Copy Username" content={entry.username} />
              ) : null}
              {entry.url ? <Action.OpenInBrowser url={entry.url} /> : null}
              {entry.notes ? (
                <Action.CopyToClipboard title="Copy Notes" content={entry.notes} />
              ) : null}
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
