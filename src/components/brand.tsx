export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-primary font-display text-sm font-bold text-primary-foreground">
        V
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-sm font-semibold">Verveox CRM</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Verveox Technologies
          </div>
        </div>
      )}
    </div>
  );
}
