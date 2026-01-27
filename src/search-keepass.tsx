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

import { createKeepassHttpClient, Preferences, type KeepassEntry } from "./keepass-http";

const SEARCH_DEBOUNCE_MS = 250;

export default function Command() {
  const preferences = useMemo(() => getPreferenceValues<Preferences>(), []);
  const client = useMemo(() => createKeepassHttpClient(preferences), [preferences]);
  const [searchText, setSearchText] = useState("");
  const [entries, setEntries] = useState<KeepassEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const runTest = async () => {
      try {
        await client.testAssociate();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to test KeePass access.";
        await showToast({
          style: Toast.Style.Failure,
          title: "KeePass HTTP Error",
          message,
        });
      }
    };

    runTest();
  }, [client]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await client.getLogins(searchText);
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
  }, [client, searchText]);

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
