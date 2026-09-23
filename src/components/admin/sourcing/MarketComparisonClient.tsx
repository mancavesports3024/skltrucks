"use client";

import { useState } from "react";
import { compareMarketAction } from "@/app/admin/sourcing/actions";
import MarketComparisonPanel from "@/components/admin/sourcing/MarketComparisonPanel";
import type {
  MarketComparisonRecord,
  MarketComparisonReport,
} from "@/lib/sourcing/market-comparison/types";

type Props = {
  leadId: string;
  eligible: boolean;
  missingRequired: string[];
  missingPreferred: string[];
  latest: MarketComparisonRecord | null;
};

export default function MarketComparisonClient(props: Props) {
  const [error, setError] = useState<string | null>(null);
  const [justCompleted, setJustCompleted] = useState<MarketComparisonReport | null>(null);

  async function action(formData: FormData) {
    setError(null);
    const result = await compareMarketAction(formData);
    if (result.error) {
      setError(result.error);
      setJustCompleted(null);
      return;
    }
    if (result.report) setJustCompleted(result.report);
  }

  return (
    <MarketComparisonPanel
      {...props}
      action={action}
      error={error}
      justCompleted={justCompleted}
    />
  );
}
