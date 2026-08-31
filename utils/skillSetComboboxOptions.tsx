import React from 'react';
import { getSkillSetGroupLabel, getSkillSetRank } from '@/utils/skillSetRank';

export type SkillSetComboboxOption = {
  value: string;
  label: React.ReactNode;
  displayValue: string;
  disabled?: boolean;
};

type SkillSetItem = {
  id: string;
  name: string;
  is_custom?: boolean;
};

type FormatItemResult = {
  label: React.ReactNode;
  displayValue: string;
  disabled?: boolean;
};

/**
 * Grouped Skill Set combobox options (Custom first, then edition rank bands).
 * Group headers are disabled rows so Combobox treats them as section headers.
 */
export function buildGroupedSkillSetComboboxOptions(
  skillTypes: readonly SkillSetItem[],
  editionSlug?: string | null,
  opts?: {
    excludeIds?: ReadonlySet<string>;
    formatItem?: (item: SkillSetItem) => FormatItemResult;
  },
): SkillSetComboboxOption[] {
  const skillSetRank = getSkillSetRank(editionSlug);
  const excludeIds = opts?.excludeIds;
  const formatItem =
    opts?.formatItem ??
    ((item: SkillSetItem): FormatItemResult => ({
      label: <span className="pl-3">{item.name}</span>,
      displayValue: item.name,
    }));

  const available = excludeIds
    ? skillTypes.filter((s) => !excludeIds.has(s.id))
    : [...skillTypes];

  const customCategories = available.filter((c) => c.is_custom);
  const standardCategories = available.filter((c) => !c.is_custom);

  const groupByLabel: Record<string, SkillSetItem[]> = {};
  standardCategories.forEach((category) => {
    const rank = skillSetRank[category.name.toLowerCase()] ?? Infinity;
    const groupLabel = getSkillSetGroupLabel(rank);
    if (!groupByLabel[groupLabel]) groupByLabel[groupLabel] = [];
    groupByLabel[groupLabel].push(category);
  });

  const sortedGroupLabels = Object.keys(groupByLabel).sort((a, b) => {
    const aRank = Math.min(
      ...groupByLabel[a].map((cat) => skillSetRank[cat.name.toLowerCase()] ?? Infinity),
    );
    const bRank = Math.min(
      ...groupByLabel[b].map((cat) => skillSetRank[cat.name.toLowerCase()] ?? Infinity),
    );
    return aRank - bRank;
  });

  const options: SkillSetComboboxOption[] = [];

  const pushCategory = (category: SkillSetItem) => {
    const formatted = formatItem(category);
    options.push({
      value: category.id,
      label: formatted.label,
      displayValue: formatted.displayValue,
      ...(formatted.disabled ? { disabled: true } : {}),
    });
  };

  if (customCategories.length > 0) {
    options.push({
      value: '__group__custom',
      label: (
        <span className="text-xs font-bold uppercase tracking-wide">
          Custom Skill Sets
        </span>
      ),
      displayValue: 'Custom Skill Sets',
      disabled: true,
    });
    customCategories
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(pushCategory);
  }

  sortedGroupLabels.forEach((groupLabel) => {
    options.push({
      value: `__group__${groupLabel}`,
      label: (
        <span className="text-xs font-bold uppercase tracking-wide">
          {groupLabel}
        </span>
      ),
      displayValue: groupLabel,
      disabled: true,
    });
    const groupCategories = groupByLabel[groupLabel].slice().sort((a, b) => {
      const rankA = skillSetRank[a.name.toLowerCase()] ?? Infinity;
      const rankB = skillSetRank[b.name.toLowerCase()] ?? Infinity;
      return rankA - rankB;
    });
    groupCategories.forEach(pushCategory);
  });

  return options;
}
