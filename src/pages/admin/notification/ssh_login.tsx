import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  NodeDetailsProvider,
  useNodeDetails,
} from "@/contexts/NodeDetailsContext";
import {
  SSHLoginProvider,
  useSSHLogin,
  type SSHLoginNotification,
} from "@/contexts/SSHLoginContext";
import Loading from "@/components/loading";
import {
  Badge,
  Button,
  Dialog,
  Flex,
  IconButton,
  Switch,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Pencil, Search, Trash2 } from "lucide-react";
import React from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

const parseWhitelist = (text: string): string[] =>
  text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean);

const formatWhitelist = (values?: string[]): string => (values || []).join("\n");

const parseJsonOrThrow = async (res: Response, fallbackMessage: string) => {
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.message || fallbackMessage);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  return data;
};

const SSHLoginPage = () => {
  return (
    <SSHLoginProvider>
      <NodeDetailsProvider>
        <InnerLayout />
      </NodeDetailsProvider>
    </SSHLoginProvider>
  );
};

const SSHLoginEditForm = ({
  initialValues,
  onSubmit,
  loading,
  onCancel,
}: {
  initialValues: { enable: boolean; ip_whitelist: string[] };
  onSubmit: (values: { enable: boolean; ip_whitelist: string[] }) => void;
  loading?: boolean;
  onCancel?: () => void;
}) => {
  const { t } = useTranslation();
  const [enabled, setEnabled] = React.useState(initialValues.enable);
  const [whitelist, setWhitelist] = React.useState(
    formatWhitelist(initialValues.ip_whitelist)
  );

  React.useEffect(() => {
    setEnabled(initialValues.enable);
    setWhitelist(formatWhitelist(initialValues.ip_whitelist));
  }, [initialValues]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ enable: enabled, ip_whitelist: parseWhitelist(whitelist) });
      }}
    >
      <label htmlFor="ssh-login-status">{t("common.status")}</label>
      <Switch
        id="ssh-login-status"
        checked={enabled}
        onCheckedChange={setEnabled}
      />

      <label htmlFor="ssh-login-whitelist">
        {t("notification.ssh_login.whitelist")}
      </label>
      <TextArea
        id="ssh-login-whitelist"
        value={whitelist}
        rows={7}
        placeholder={t("notification.ssh_login.whitelist_placeholder")}
        onChange={(e) => setWhitelist(e.target.value)}
      />
      <Text size="2" color="gray">
        {t("notification.ssh_login.whitelist_tip")}
      </Text>

      <Flex gap="2" justify="end" className="mt-4">
        {onCancel && (
          <Dialog.Close>
            <Button variant="soft" color="gray" type="button" onClick={onCancel}>
              {t("common.cancel")}
            </Button>
          </Dialog.Close>
        )}
        <Button variant="solid" type="submit" disabled={loading}>
          {t("common.save")}
        </Button>
      </Flex>
    </form>
  );
};

const InnerLayout = () => {
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string[]>([]);
  const [batchDialogOpen, setBatchDialogOpen] = React.useState(false);
  const [batchLoading, setBatchLoading] = React.useState(false);
  const [batchForm, setBatchForm] = React.useState({
    enable: true,
    ip_whitelist: [] as string[],
  });
  const { notifications, loading, error, refresh, refreshEvents } = useSSHLogin();
  const { isLoading: nodeLoading, error: nodeError } = useNodeDetails();
  const { t } = useTranslation();

  const saveBatch = (values: { enable: boolean; ip_whitelist: string[] }) => {
    setBatchLoading(true);
    const payload = selected.map((client) => ({ client, ...values }));
    fetch("/api/admin/notification/ssh-login/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) =>
        parseJsonOrThrow(res, t("notification.ssh_login.errors.update_failed"))
      )
      .then(() => {
        toast.success(t("common.updated_successfully"));
        setBatchDialogOpen(false);
        refresh();
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setBatchLoading(false));
  };

  const clearEvents = () => {
    fetch("/api/admin/notification/ssh-login/events/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((res) =>
        parseJsonOrThrow(
          res,
          t("notification.ssh_login.errors.events_delete_failed")
        )
      )
      .then(() => {
        toast.success(t("common.updated_successfully"));
        refreshEvents();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : String(err)));
  };

  if (loading || nodeLoading) {
    return <Loading text={t("loading")} />;
  }
  if (error || nodeError) {
    return <div>{t("common.error")}: {error?.message || nodeError}</div>;
  }

  return (
    <div className="flex flex-col gap-4 md:p-4 p-1">
      <Flex justify="between" align="center" wrap="wrap" gap="3">
        <div className="flex flex-col gap-1">
          <label className="text-2xl font-semibold">
            {t("notification.ssh_login.full_title")}
          </label>
          <Text size="2" color="gray">
            {t("notification.ssh_login.description")}
          </Text>
        </div>
        <TextField.Root
          type="text"
          className="max-w-64"
          placeholder={t("common.search")}
          value={search}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSearch(e.target.value)
          }
        >
          <TextField.Slot>
            <Search size={16} />
          </TextField.Slot>
        </TextField.Root>
      </Flex>

      <SSHLoginTable
        search={search}
        selected={selected}
        onSelectionChange={setSelected}
      />

      <label className="text-sm text-muted-foreground">
        {t("common.selected", { count: selected.length })}
      </label>

      <Flex gap="2" align="center">
        <Dialog.Root open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
          <Dialog.Trigger>
            <Button
              variant="soft"
              disabled={batchLoading || selected.length === 0}
              onClick={() => {
                const first = notifications.find((n) => n.client === selected[0]);
                setBatchForm({
                  enable: first?.enable ?? true,
                  ip_whitelist: first?.ip_whitelist ?? [],
                });
              }}
            >
              {t("notification.ssh_login.batch_edit")}
            </Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>{t("notification.ssh_login.batch_edit")}</Dialog.Title>
            <SSHLoginEditForm
              initialValues={batchForm}
              loading={batchLoading}
              onSubmit={saveBatch}
              onCancel={() => setBatchDialogOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Root>
        <Button variant="soft" color="gray" onClick={refresh}>
          {t("common.refresh")}
        </Button>
      </Flex>

      <Flex justify="between" align="center" className="mt-4">
        <label className="text-xl font-semibold">
          {t("notification.ssh_login.events_title")}
        </label>
        <Button variant="soft" color="red" onClick={clearEvents}>
          <Trash2 size={16} />
          {t("notification.ssh_login.clear_events")}
        </Button>
      </Flex>
      <SSHLoginEventsTable />
    </div>
  );
};

const SSHLoginTable = ({
  search,
  selected,
  onSelectionChange,
}: {
  search: string;
  selected: string[];
  onSelectionChange: (ids: string[]) => void;
}) => {
  const { notifications } = useSSHLogin();
  const { nodeDetail } = useNodeDetails();
  const { t } = useTranslation();

  const filtered = [...nodeDetail]
    .sort((a, b) => a.weight - b.weight)
    .filter((node) => node.name.toLowerCase().includes(search.toLowerCase()));

  const configFor = (uuid: string): SSHLoginNotification | undefined =>
    notifications.find((n) => n.client === uuid);

  return (
    <div className="rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-6">
              <Checkbox
                checked={
                  selected.length === filtered.length
                    ? true
                    : selected.length > 0
                    ? "indeterminate"
                    : false
                }
                onCheckedChange={(checked) =>
                  onSelectionChange(checked ? filtered.map((n) => n.uuid) : [])
                }
              />
            </TableHead>
            <TableHead>{t("common.server")}</TableHead>
            <TableHead>{t("common.status")}</TableHead>
            <TableHead>{t("notification.ssh_login.whitelist")}</TableHead>
            <TableHead>{t("common.action")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((node) => {
            const item = configFor(node.uuid);
            const enabled = item?.enable ?? true;
            return (
              <TableRow key={node.uuid}>
                <TableCell>
                  <Checkbox
                    checked={selected.includes(node.uuid)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        onSelectionChange([...selected, node.uuid]);
                      } else {
                        onSelectionChange(selected.filter((id) => id !== node.uuid));
                      }
                    }}
                  />
                </TableCell>
                <TableCell>{node.name}</TableCell>
                <TableCell>
                  <Badge color={enabled ? "green" : "red"}>
                    {enabled ? t("common.enabled") : t("common.disabled")}
                  </Badge>
                </TableCell>
                <TableCell>{item?.ip_whitelist?.length || 0}</TableCell>
                <TableCell>
                  <ActionButtons nodeUUID={node.uuid} config={item} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

const ActionButtons = ({
  nodeUUID,
  config,
}: {
  nodeUUID: string;
  config: SSHLoginNotification | undefined;
}) => {
  const { t } = useTranslation();
  const { refresh } = useSSHLogin();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <IconButton variant="ghost">
          <Pencil size={16} />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Title>{t("common.edit")}</Dialog.Title>
        <SSHLoginEditForm
          initialValues={{
            enable: config?.enable ?? true,
            ip_whitelist: config?.ip_whitelist ?? [],
          }}
          loading={saving}
          onCancel={() => setOpen(false)}
          onSubmit={(values) => {
            setSaving(true);
            fetch("/api/admin/notification/ssh-login/edit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify([{ client: nodeUUID, ...values }]),
            })
              .then((res) =>
                parseJsonOrThrow(
                  res,
                  t("notification.ssh_login.errors.save_failed")
                )
              )
              .then(() => {
                toast.success(t("common.updated_successfully"));
                setOpen(false);
                refresh();
              })
              .catch((err) =>
                toast.error(err instanceof Error ? err.message : String(err))
              )
              .finally(() => setSaving(false));
          }}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
};

const SSHLoginEventsTable = () => {
  const { events } = useSSHLogin();
  const { nodeDetail } = useNodeDetails();
  const { t } = useTranslation();
  const nameOf = (uuid: string) =>
    nodeDetail.find((node) => node.uuid === uuid)?.name || uuid;

  return (
    <div className="rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("common.server")}</TableHead>
            <TableHead>{t("notification.ssh_login.user")}</TableHead>
            <TableHead>{t("notification.ssh_login.source")}</TableHead>
            <TableHead>{t("notification.ssh_login.auth_method")}</TableHead>
            <TableHead>{t("notification.ssh_login.result")}</TableHead>
            <TableHead>{t("notification.ssh_login.time")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center text-muted-foreground">
                {t("notification.ssh_login.no_events")}
              </TableCell>
            </TableRow>
          ) : (
            events.map((event) => (
              <TableRow key={event.id}>
                <TableCell>{nameOf(event.client)}</TableCell>
                <TableCell>{event.user}</TableCell>
                <TableCell>
                  {event.remote_ip}
                  {event.remote_port ? `:${event.remote_port}` : ""}
                </TableCell>
                <TableCell>{event.auth_method}</TableCell>
                <TableCell>
                  <Badge color={event.whitelisted ? "gray" : "green"}>
                    {event.whitelisted
                      ? t("notification.ssh_login.whitelisted")
                      : t("notification.ssh_login.notified")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {event.occurred_at
                    ? new Date(event.occurred_at).toLocaleString()
                    : "-"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default SSHLoginPage;
