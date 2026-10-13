import { Badge } from "@/components/ui/badge";

const LABELS = { refurbished: "Refurbished", used: "Used" };

// Shown only for non-new items, so "new" stays the quiet default.
export default function ConditionBadge({ condition }) {
  if (!LABELS[condition]) return null;
  return (
    <Badge variant="outline" className="border-transparent bg-amber-100 text-amber-800">
      {LABELS[condition]}
    </Badge>
  );
}
