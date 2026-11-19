"use client";

import * as React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { normalizeFa } from "@/lib/ir-geo";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";

/**
 * SearchableSelect — کمبوباکس با قابلیت جستجو (فاز ۷۲)
 *
 * جایگزین Select شادکنا برای فهرست‌های بلند (مراکز، کاربران، مدیریت‌ها، شهرها).
 * - RTL کامل با جستجوی فارسی (نرمال‌سازی ی/ك/نیم‌فاصله)
 * - option «هیچکدام» اختیاری (noneLabel) برای پاک کردن انتخاب
 */

export interface SearchOption {
  value: string;
  label: string;
  hint?: string;
}

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchOption[];
  placeholder?: string;
  /** گزینهٔ «انتخاب نشده» با value خالی — اگر تعریف شود بالای فهرست می‌آید */
  noneLabel?: string;
  emptyLabel?: string;
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "انتخاب کنید",
  noneLabel,
  emptyLabel = "موردی یافت نشد",
  className,
  disabled,
  loading,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    const q = normalizeFa(query);
    if (!q) return options;
    return options.filter((o) =>
      normalizeFa(`${o.label} ${o.hint || ""}`).includes(q)
    );
  }, [options, query]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }} modal>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between gap-2 font-normal h-9",
            !selected && !noneLabel && "text-muted-foreground",
            className
          )}
        >
          <span className="truncate">
            {loading ? "در حال بارگذاری…" : selected ? selected.label : noneLabel || placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="start"
        className="p-0 min-w-[12rem]"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command shouldFilter={false}>
          <div className="relative border-b">
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="جستجو…"
              className="h-9 pr-3"
            />
          </div>
          <CommandList className="max-h-56">
            <CommandEmpty>{emptyLabel}</CommandEmpty>
            {noneLabel && filtered.length > 0 && !query && (
              <CommandItem
                value="__none__"
                onSelect={() => { onChange(""); setOpen(false); setQuery(""); }}
                className="text-muted-foreground"
              >
                <Check className={cn("me-2 size-4", value === "" ? "opacity-100" : "opacity-0")} />
                {noneLabel}
              </CommandItem>
            )}
            {filtered.map((o) => (
              <CommandItem
                key={o.value}
                value={o.value}
                onSelect={() => { onChange(o.value); setOpen(false); setQuery(""); }}
              >
                <Check className={cn("me-2 size-4 shrink-0", value === o.value ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="ms-auto text-[11px] text-muted-foreground shrink-0">{o.hint}</span>}
              </CommandItem>
            ))}
            {loading && (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" /> بارگذاری…
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
