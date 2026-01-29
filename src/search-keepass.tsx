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

import {
  createKeepassHttpClient,
  KeepassAssociationError,
  Preferences,
  type KeepassEntry,
} from "./keepass-http";

const SEARCH_DEBOUNCE_MS = 250;

type KeepassHttpEntry = KeepassEntry & {
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
  Group?: string;
  GroupPath?: string;
  StringFields?: Record<string, string>;
};

const mapEntryForDisplay = (entry: KeepassHttpEntry): KeepassEntry => {
  const stringFields = entry.StringFields ?? {};
  return {
    uuid: entry.uuid ?? entry.UUID ?? entry.Uuid,
    title: entry.title ?? entry.Title ?? entry.Name ?? "Untitled",
    username:
      entry.username ??
      entry.Username ??
      entry.Login ??
      stringFields.UserName ??
      stringFields.username ??
      undefined,
    password: entry.password ?? entry.Password ?? stringFields.Password ?? undefined,
    url: entry.url ?? entry.Url ?? entry.URL,
    notes: entry.notes ?? entry.Notes,
    group: entry.group ?? entry.Group ?? entry.GroupPath,
  };
};

export default function Command() {
  const preferences = useMemo(() => getPreferenceValues<Preferences>(), []);
  const client = useMemo(() => createKeepassHttpClient(preferences), [preferences]);
  const [searchText, setSearchText] = useState("");
  const [entries, setEntries] = useState<KeepassHttpEntry[]>([]);
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
        if (error instanceof KeepassAssociationError) {
          if (error.kind === "invalid") {
            await client.clearSharedKey();
          }
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
      {entries.map((entry) => {
        const displayEntry = mapEntryForDisplay(entry);
        return (
          <List.Item
            key={displayEntry.uuid ?? `${displayEntry.title}-${displayEntry.username ?? "unknown"}`}
            id={displayEntry.uuid}
            title={displayEntry.title}
            subtitle={displayEntry.username}
            accessories={[
              ...(displayEntry.group ? [{ icon: Icon.Folder, text: displayEntry.group }] : []),
              ...(displayEntry.url ? [{ icon: Icon.Globe, text: displayEntry.url }] : []),
            ]}
            actions={
              <ActionPanel>
                {displayEntry.password ? (
                  <Action.CopyToClipboard title="Copy Password" content={displayEntry.password} />
                ) : null}
                {displayEntry.username ? (
                  <Action.CopyToClipboard title="Copy Username" content={displayEntry.username} />
                ) : null}
                {displayEntry.url ? <Action.OpenInBrowser url={displayEntry.url} /> : null}
                {displayEntry.notes ? (
                  <Action.CopyToClipboard title="Copy Notes" content={displayEntry.notes} />
                ) : null}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
