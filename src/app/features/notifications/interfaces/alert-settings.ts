import { AlertLevel, AlertMoment, AlertRuleId, AlertRuleKind } from '../types/alert-settings.type';

export interface AlertThresholds {
  bajo: number | null;
  medio: number | null;
  alto: number;
}

export interface FeedCoverageThresholds {
  dias_aviso_bajo: number | null;
  dias_aviso: number;
  dias_urgencia: number;
}

export interface AlertRule {
  id: AlertRuleId;
  kind: AlertRuleKind;
  title: string;
  description: string;
}

export interface AlertModule {
  id: string;
  title: string;
  description: string;
  icon: string;
  rules: readonly AlertRule[];
}

export interface AlertThresholdField {
  level: AlertLevel;
  label: string;
  moment: AlertMoment;
  days: number | null;
  min: number;
  max: number;
  options: readonly { value: AlertMoment; label: string }[];
}

export interface AlertSettingsResult {
  thresholds: AlertThresholds | null;
  error: string;
}
