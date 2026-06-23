import React from "react";
import { useTranslation } from "react-i18next";

export type SSHLoginNotification = {
  client: string;
  enable: boolean;
  ip_whitelist?: string[];
};

export type SSHLoginEvent = {
  id: string;
  client: string;
  user: string;
  remote_ip: string;
  remote_port: number;
  auth_method: string;
  occurred_at: string;
  created_at: string;
  whitelisted: boolean;
};

interface SSHLoginContextType {
  notifications: SSHLoginNotification[];
  events: SSHLoginEvent[];
  loading?: boolean;
  error?: Error | null;
  refresh: () => Promise<void>;
  refreshEvents: () => Promise<void>;
}

const SSHLoginContext = React.createContext<SSHLoginContextType | undefined>(
  undefined
);

const readEnvelope = async <T,>(response: Response, fallback: string): Promise<T> => {
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || fallback);
  }
  const data = await response.json();
  return data.data || data;
};

export const SSHLoginProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = React.useState<
    SSHLoginNotification[]
  >([]);
  const [events, setEvents] = React.useState<SSHLoginEvent[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<Error | null>(null);
  const firstLoad = React.useRef(true);

  const refreshNotifications = async () => {
    const response = await fetch("/api/admin/notification/ssh-login/");
    const data = await readEnvelope<SSHLoginNotification[]>(
      response,
      t("notification.ssh_login.errors.fetch_failed")
    );
    setNotifications(data || []);
  };

  const refreshEvents = async () => {
    const response = await fetch("/api/admin/notification/ssh-login/events?limit=100");
    const data = await readEnvelope<SSHLoginEvent[]>(
      response,
      t("notification.ssh_login.errors.events_fetch_failed")
    );
    setEvents(data || []);
  };

  const refresh = async () => {
    if (firstLoad.current) setLoading(true);
    try {
      setError(null);
      await Promise.all([refreshNotifications(), refreshEvents()]);
    } catch (err) {
      console.error("Error fetching SSH login settings:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (firstLoad.current) {
        setLoading(false);
        firstLoad.current = false;
      }
    }
  };

  React.useEffect(() => {
    refresh();
  }, []);

  return (
    <SSHLoginContext.Provider
      value={{ notifications, events, refresh, refreshEvents, loading, error }}
    >
      {children}
    </SSHLoginContext.Provider>
  );
};

export const useSSHLogin = () => {
  const context = React.useContext(SSHLoginContext);
  if (!context) {
    throw new Error("useSSHLogin must be used within a SSHLoginProvider");
  }
  return context;
};
