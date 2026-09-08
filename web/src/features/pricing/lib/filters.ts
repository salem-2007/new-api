/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  SORT_OPTIONS,
  FILTER_ALL,
  QUOTA_TYPES,
  QUOTA_TYPE_VALUES,
  ENDPOINT_TYPES,
} from '../constants'
import type { PricingModel } from '../types'
import { hasTaskUsageSchema } from './dynamic-price'

// ----------------------------------------------------------------------------
// Filter Utilities
// ----------------------------------------------------------------------------

/**
 * Filter models by search query
 */
export function filterBySearch(
  models: PricingModel[],
  query: string
): PricingModel[] {
  if (!query) return models

  const lowerQuery = query.toLowerCase()
  return models.filter(
    (m) =>
      m.model_name?.toLowerCase().includes(lowerQuery) ||
      m.description?.toLowerCase().includes(lowerQuery) ||
      m.tags?.toLowerCase().includes(lowerQuery) ||
      m.vendor_name?.toLowerCase().includes(lowerQuery)
  )
}

/**
 * Filter models by vendor
 */
export function filterByVendor(
  models: PricingModel[],
  vendor: string
): PricingModel[] {
  if (vendor === FILTER_ALL) return models
  return models.filter((m) => m.vendor_name === vendor)
}

/**
 * Filter models by group
 */
export function filterByGroup(
  models: PricingModel[],
  group: string
): PricingModel[] {
  if (group === FILTER_ALL) return models
  return models.filter((m) => m.enable_groups?.includes(group))
}

/**
 * Filter models by quota type
 */
export function filterByQuotaType(
  models: PricingModel[],
  quotaType: string
): PricingModel[] {
  if (quotaType === QUOTA_TYPES.ALL) return models
  // Task-usage models form their own bucket, disjoint from token/request.
  if (quotaType === QUOTA_TYPES.TASK) {
    return models.filter((m) => hasTaskUsageSchema(m))
  }
  const targetType =
    quotaType === QUOTA_TYPES.TOKEN
      ? QUOTA_TYPE_VALUES.TOKEN
      : QUOTA_TYPE_VALUES.REQUEST
  return models.filter(
    (m) => m.quota_type === targetType && !hasTaskUsageSchema(m)
  )
}

/**
 * Filter models by endpoint type
 */
export function filterByEndpointType(
  models: PricingModel[],
  endpointType: string
): PricingModel[] {
  if (endpointType === ENDPOINT_TYPES.ALL) return models
  return models.filter((m) =>
    m.supported_endpoint_types?.includes(endpointType)
  )
}

/**
 * Get model price for sorting
 */
function getModelPrice(model: PricingModel): number {
  return model.quota_type === 0 ? model.model_ratio : model.model_price || 0
}

/** Vendor priority for the default smart sort (lower = earlier) */
const VENDOR_PRIORITY: Record<string, number> = {
  OpenAI: 0,
  Anthropic: 1,
  Google: 2,
  智谱: 3,
  'Z.AI': 3,
  Zhipu: 3,
  'Zhipu AI': 3,
  DeepSeek: 4,
  阿里巴巴: 5,
  Moonshot: 6,
  'Moonshot AI': 6,
  xAI: 7,
  Meta: 8,
  Mistral: 9,
  阿里: 5,
}

function vendorRank(vendor?: string): number {
  if (!vendor) return 50
  return VENDOR_PRIORITY[vendor] ?? 50
}

/** Extract version tuple from a model name, e.g. gpt-5.6-luna -> [5,6] */
function versionKey(name: string): number[] {
  const m = name.match(/(\d+)\.(\d+)(?:\.(\d+))?/)
  if (!m) return []
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
}

/** Base family name for grouping variants: gpt-5.6-luna -> gpt-5.6 */
function familyKey(name: string): string {
  return name.replace(/-(luna|sol|terra|thinking|high|low|max|medium|mini|nano|flash|pro|exp|preview|nothinking|xhigh|testing|new|vision)$/i, '')
}

/** Natural compare so gpt-5.10 sorts after gpt-5.9 */
function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

/**
 * Sort models by specified option
 */
export function sortModels(
  models: PricingModel[],
  sortBy: string
): PricingModel[] {
  const sorted = [...models]

  switch (sortBy) {
    case SORT_OPTIONS.NAME:
      sorted.sort((a, b) =>
        naturalCompare(a.model_name || '', b.model_name || '')
      )
      break
    case SORT_OPTIONS.PRICE_LOW: {
      // 未定价(0)沉底, 有价按升序
      sorted.sort((a, b) => {
        const pa = getModelPrice(a)
        const pb = getModelPrice(b)
        if (pa === 0 && pb !== 0) return 1
        if (pb === 0 && pa !== 0) return -1
        if (pa !== pb) return pa - pb
        return naturalCompare(a.model_name || '', b.model_name || '')
      })
      break
    }
    case SORT_OPTIONS.PRICE_HIGH: {
      sorted.sort((a, b) => {
        const pa = getModelPrice(a)
        const pb = getModelPrice(b)
        if (pa === 0 && pb !== 0) return 1
        if (pb === 0 && pa !== 0) return -1
        if (pa !== pb) return pb - pa
        return naturalCompare(a.model_name || '', b.model_name || '')
      })
      break
    }
    default: {
      // 智能排序(默认): 主流厂商优先 -> 版本新在前 -> 同族变体聚合 -> 名称
      sorted.sort((a, b) => {
        const an = a.model_name || ''
        const bn = b.model_name || ''
        const vr = vendorRank(a.vendor_name) - vendorRank(b.vendor_name)
        if (vr !== 0) return vr
        const va = versionKey(an)
        const vb = versionKey(bn)
        for (let i = 0; i < Math.max(va.length, vb.length); i++) {
          const d = (vb[i] ?? 0) - (va[i] ?? 0)
          if (d !== 0) return d
        }
        const fa = familyKey(an)
        const fb = familyKey(bn)
        if (fa !== fb) return naturalCompare(fa, fb)
        return naturalCompare(an, bn)
      })
      break
    }
  }

  return sorted
}

/**
 * Apply all filters and sorting to models
 */
export function filterAndSortModels(
  models: PricingModel[],
  filters: {
    search: string
    vendor: string
    group: string
    quotaType: string
    endpointType: string
    tag: string
    sortBy: string
  }
): PricingModel[] {
  let result = filterBySearch(models, filters.search)
  result = filterByVendor(result, filters.vendor)
  result = filterByGroup(result, filters.group)
  result = filterByQuotaType(result, filters.quotaType)
  result = filterByEndpointType(result, filters.endpointType)
  result = filterByTag(result, filters.tag)
  result = sortModels(result, filters.sortBy)

  return result
}

/**
 * Parse tags from comma-separated string
 */
export function parseTags(tagsString?: string): string[] {
  if (!tagsString) return []
  return tagsString
    .split(/[,;|\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

/**
 * Extract all unique tags from models
 */
export function extractAllTags(models: PricingModel[]): string[] {
  const tagSet = new Set<string>()

  models.forEach((model) => {
    if (model.tags) {
      const tags = parseTags(model.tags)
      tags.forEach((tag) => {
        tagSet.add(tag.toLowerCase())
      })
    }
  })

  return Array.from(tagSet).sort((a, b) => a.localeCompare(b))
}

/**
 * Filter models by tag
 */
export function filterByTag(
  models: PricingModel[],
  tag: string
): PricingModel[] {
  if (tag === FILTER_ALL) return models

  const tagLower = tag.toLowerCase()
  return models.filter((m) => {
    if (!m.tags) return false
    const modelTags = parseTags(m.tags).map((t) => t.toLowerCase())
    return modelTags.includes(tagLower)
  })
}
