import { useTranslation } from "react-i18next";
import { Checkbox, Flex, Text } from "@radix-ui/themes";
import { updateSettingsWithToast, useSettings } from "@/lib/api";
import {
  SettingCard,
  SettingCardButton,
  SettingCardLabel,
  SettingCardLongTextInput,
  SettingCardSwitch,
} from "@/components/admin/SettingCard";
import { toast } from "sonner";
import Loading from "@/components/loading";
import React from "react";
import { renderProviderInputs } from "@/utils/renderProviders";
import { SquareArrowOutUpRight } from "lucide-react";
import { Link } from "react-router-dom";

const normalizeNotificationMethods = (settings: any, senders: string[]) => {
  const raw = settings.notification_methods;
  const hasMultiValue =
    Array.isArray(raw) ||
    (typeof raw === "string" && raw.trim().length > 0);
  let values: string[] = [];

  if (hasMultiValue) {
    if (Array.isArray(raw)) {
      values = raw;
    } else if (typeof raw === "string" && raw.trim()) {
      try {
        const parsed = JSON.parse(raw);
        values = Array.isArray(parsed) ? parsed : raw.split(",");
      } catch {
        values = raw.split(",");
      }
    }
  } else if (settings.notification_method) {
    values = [settings.notification_method];
  }

  const seen = new Set<string>();
  return values
    .map((value) => String(value).trim())
    .filter((value) => value && value !== "none")
    .filter((value) => senders.includes(value))
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    });
};

const preferredSenderOrder = (senders: string[]) => {
  const preferred = ["telegram", "email", "webhook"];
  return [...senders].sort((a, b) => {
    const ai = preferred.indexOf(a);
    const bi = preferred.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    }
    return a.localeCompare(b);
  });
};

const NotificationSettings = () => {
  const { t } = useTranslation();
  const { settings, loading, error } = useSettings();
  const [messageDefs, setMessageDefs] = React.useState<any>({});
  const [messageList, setMessageList] = React.useState<string[]>([]);
  const [selectedMessageSenders, setSelectedMessageSenders] = React.useState<string[]>([]);
  const [currentMessageSender, setCurrentMessageSender] = React.useState<string>("");
  const [messageValues, setMessageValues] = React.useState<any>({});
  const [messageLoading, setMessageLoading] = React.useState(false);
  const [messageError, setMessageError] = React.useState("");

  // 拉取所有 message sender 及字段定义
  React.useEffect(() => {
    if (loading) return;
    setMessageLoading(true);
    fetch("/api/admin/settings/message-sender")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success" && data.data) {
          setMessageDefs(data.data);
          const senders = preferredSenderOrder(Object.keys(data.data));
          setMessageList(senders);
          const initialSenders = normalizeNotificationMethods(settings, senders);
          setSelectedMessageSenders(initialSenders);
          const initialSender = initialSenders[0] || "";
          setCurrentMessageSender(initialSender);
        } else {
          setMessageError(data.message || t("settings.notification.provider_fetch_failed"));
        }
      })
      .catch(() => setMessageError(t("settings.notification.provider_fetch_failed")))
      .finally(() => setMessageLoading(false));
  }, [loading, settings, t]);

  // 拉取当前 message sender 的设置
  React.useEffect(() => {
    if (!currentMessageSender) return;
    setMessageLoading(true);
    fetch(`/api/admin/settings/message-sender?provider=${currentMessageSender}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success" && data.data) {
          try {
            setMessageValues(JSON.parse(data.data.addition || "{}"));
          } catch {
            setMessageValues({});
          }
        } else {
          setMessageError(data.message || t("settings.notification.provider_settings_fetch_failed"));
        }
      })
      .catch(() => setMessageError(t("settings.notification.provider_settings_fetch_failed")))
      .finally(() => setMessageLoading(false));
  }, [currentMessageSender, t]);

  // 处理保存
  const handleMessageSave = async (values: any) => {
    setMessageLoading(true);
    setMessageError("");
    const body = {
      name: currentMessageSender,
      addition: JSON.stringify(values),
    };
    try {
      const res = await fetch("/api/admin/settings/message-sender", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status !== "success") {
        throw new Error(data.message || t("common.error"));
      } else {
        setMessageValues(values);
      }
      toast.success(t("common.success"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
    setMessageLoading(false);
  };

  const handleMessageSenderToggle = async (sender: string, checked: boolean) => {
    const nextSenders = checked
      ? [...selectedMessageSenders, sender]
      : selectedMessageSenders.filter((item) => item !== sender);
    const normalizedNextSenders = normalizeNotificationMethods(
      { notification_methods: nextSenders },
      messageList,
    );
    const previousSenders = selectedMessageSenders;
    const previousCurrentSender = currentMessageSender;

    setSelectedMessageSenders(normalizedNextSenders);
    if (checked || currentMessageSender === sender) {
      setCurrentMessageSender(sender);
    }
    if (!checked && currentMessageSender === sender) {
      setCurrentMessageSender(normalizedNextSenders[0] || "");
    }

    try {
      await updateSettingsWithToast(
        {
          notification_methods: normalizedNextSenders,
          notification_method: normalizedNextSenders[0] || "none",
        },
        t,
      );
    } catch (error) {
      setSelectedMessageSenders(previousSenders);
      setCurrentMessageSender(previousCurrentSender);
      throw error;
    }
  };

  if (loading || (!messageLoading && messageList.length === 0 && !messageError)) {
    return <Loading />;
  }
  if (error) {
    return <Text color="red">{error}</Text>;
  }
  if (messageError) {
    return <Text color="red">{messageError}</Text>;
  }

  return (
    <>
      <SettingCardLabel>{t("settings.notification.title")}</SettingCardLabel>
      <SettingCardSwitch
        title={t("settings.notification.enable")}
        description={t("settings.notification.enable_description")}
        defaultChecked={settings.notification_enabled}
        onChange={async (checked) => {
          await updateSettingsWithToast({ notification_enabled: checked }, t);
        }}
      />
      <SettingCardLongTextInput
        title={t("settings.notification.template")}
        description={t("settings.notification.template_description")}
        defaultValue={settings.notification_template}
        OnSave={
          async (value) => {
            await updateSettingsWithToast({ notification_template: value }, t);
          }}
      />
      <SettingCard
        title={t("settings.notification.method")}
        description={t("settings.notification.method_description")}
      >
        <Flex direction="row" gap="4" wrap="wrap" className="w-full pt-3">
          {messageList.map((sender) => (
            <label
              key={sender}
              className="flex cursor-pointer select-none items-center gap-2 rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor:
                  currentMessageSender === sender
                    ? "var(--accent-8)"
                    : "var(--gray-a5)",
              }}
              onClick={() => setCurrentMessageSender(sender)}
            >
              <Checkbox
                checked={selectedMessageSenders.includes(sender)}
                onCheckedChange={(checked) => {
                  void handleMessageSenderToggle(sender, checked === true);
                }}
              />
              <span>{sender}</span>
            </label>
          ))}
        </Flex>
      </SettingCard>
      {messageLoading ? <Loading /> : renderProviderInputs({
        currentProvider: currentMessageSender,
        providerDefs: messageDefs,
        providerValues: messageValues,
        translationPrefix: `settings.notification.${currentMessageSender}`,
        title: t("settings.notification.provider_fields"),
        description: t("settings.notification.provider_fields_description"),
        setProviderValues: setMessageValues,
        handleSave: handleMessageSave,
        t,
      })}
      <SettingCardButton
        title={t("settings.notification.test_title")}
        description={t("settings.notification.test_description")}
        onClick={async () => {
          try {
            const res = await fetch("/api/admin/test/sendMessage", {
              method: "POST",
            });
            let data;
            try {
              data = await res.json();
            } catch {
              toast.error(t("common.error"));
              return;
            }
            if (data && data.message && data.code !== 200) {
              toast.error(data.message);
              return;
            }
            toast.success(t("common.success"));
          } catch (error) {
            toast.error(
              t("common.error") +
              ": " +
              (error instanceof Error ? error.message : String(error))
            );
          }
        }}
      >
        GO
      </SettingCardButton>
      <label className="text-muted-foreground text-sm flex flex-row items-center gap-1">
        {t("settings.notification.moved")}
        <Link
          to="/admin/notification/general"
        >
          <SquareArrowOutUpRight size={16} />
        </Link>
      </label>
    </>
  );
};

export default NotificationSettings;
