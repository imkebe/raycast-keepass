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
  const [needsAssociation, setNeedsAssociation] = useState<boolean | null>(null);
  const [isAssociating, setIsAssociating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const checkAssociation = async () => {
      try {
        const hasKey = await client.hasSharedKey();
        setNeedsAssociation(!hasKey);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to check KeePass association status.";
        await showToast({
          style: Toast.Style.Failure,
          title: "KeePass HTTP Error",
          message,
        });
        setNeedsAssociation(true);
      }
    };

    checkAssociation();
  }, [client]);

  useEffect(() => {
    const runTest = async () => {
      try {
        await client.testAssociate();
        setNeedsAssociation(false);
      } catch (error) {
        if (error instanceof Error && error.message === "KeePass HTTP association required.") {
          setNeedsAssociation(true);
          return;
        }
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

  const requestAssociation = async () => {
    if (isAssociating) {
      return;
    }
    setIsAssociating(true);
    try {
      await client.associate();
      setNeedsAssociation(false);
      await showToast({
        style: Toast.Style.Animated,
        title: "Approve KeePass Association",
        message: "Please approve the association request in KeePass.",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to request association.";
      await showToast({
        style: Toast.Style.Failure,
        title: "KeePass HTTP Error",
        message,
      });
    } finally {
      setIsAssociating(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      if (needsAssociation !== false) {
        setEntries([]);
        setIsLoading(false);
        return;
      }
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
      isLoading={isLoading || needsAssociation === null}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search KeePass entries"
      throttle
      emptyView={
        needsAssociation ? (
          <List.EmptyView
            title="Approve KeePass Association"
            description="Request association and approve it in KeePass to continue."
            actions={
              <ActionPanel>
                <Action
                  title={isAssociating ? "Requesting Association..." : "Request Association"}
                  icon={Icon.Key}
                  onAction={requestAssociation}
                />
              </ActionPanel>
            }
          />
        ) : undefined
      }
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
