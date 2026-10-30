"use client";

import {
  HeartPulse,
  GraduationCap,
  Building2,
  Brain,
  Cpu,
  CalendarCheck,
  Globe,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  HeartPulse,
  GraduationCap,
  Building2,
  Brain,
  Cpu,
  CalendarCheck,
  Globe,
};

export function SystemIcon({
  name,
  color,
  className = "size-5",
}: {
  name: string;
  color: string;
  className?: string;
}) {
  const Icon = ICONS[name] || Globe;
  return (
    <span
      className="inline-flex items-center justify-center rounded-xl shrink-0"
      style={{ backgroundColor: `${color}18`, color }}
    >
      <Icon className={className} />
    </span>
  );
}
