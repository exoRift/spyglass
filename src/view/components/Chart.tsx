import * as echarts from 'echarts'

import { useCallback, useEffect, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'

import type { Chart as ChartConfig, ValueUnit } from '../../lib/config'
import { DEFAULT_BAR_COLOR, DEFAULT_HEATMAP_COLORS, DEFAULT_TRACE_COLORS, getWeekdayName, type Table } from '../../lib/constants'

import { MdDragHandle } from 'react-icons/md'

const RESET_ZOOM_DOUBLE_CLICK_LEEWAY_MS = 500
const EXCLUSIVE_LEGEND_DOUBLE_CLICK_LEEWAY_MS = 300

const errorBoundRender: echarts.CustomSeriesRenderItem = function (params, api) {
  const xValue = api.value(0)
  const lowPoint = api.coord([xValue, api.value(2)])
  const midPoint = api.coord([xValue, api.value(1)])
  const highPoint = api.coord([xValue, api.value(3)])

  const width = 5
  const color = api.visual('color')

  const lineStyle = {
    stroke: color,
    lineWidth: 2
  }

  return {
    type: 'group',
    id: xValue.toString(),
    transition: 'all',
    children: [
      {
        type: 'line',
        id: 'vertical',
        enterFrom: {
          shape: {
            x1: midPoint[0],
            y1: midPoint[1],
            x2: midPoint[0],
            y2: midPoint[1]
          }
        },
        shape: {
          x1: highPoint[0],
          y1: highPoint[1],
          x2: lowPoint[0],
          y2: lowPoint[1]
        },
        transition: 'shape',
        style: lineStyle
      },
      {
        type: 'line',
        id: 'top',
        enterFrom: {
          shape: {
            x1: midPoint[0]! - width,
            y1: midPoint[1],
            x2: midPoint[0]! + width,
            y2: midPoint[1]
          }
        },
        shape: {
          x1: highPoint[0]! - width,
          y1: highPoint[1],
          x2: highPoint[0]! + width,
          y2: highPoint[1]
        },
        transition: 'shape',
        style: lineStyle
      },
      {
        type: 'line',
        id: 'bottom',
        enterFrom: {
          shape: {
            x1: midPoint[0]! - width,
            y1: midPoint[1],
            x2: midPoint[0]! + width,
            y2: midPoint[1]
          }
        },
        shape: {
          x1: lowPoint[0]! - width,
          y1: lowPoint[1],
          x2: lowPoint[0]! + width,
          y2: lowPoint[1]
        },
        transition: 'shape',
        style: lineStyle
      }
    ]
  }
}

const CURRENCY_BY_REGION: Record<string, string> = {
  US: 'USD',
  CA: 'CAD',
  GB: 'GBP',
  DE: 'EUR'
}

const CurrencyFormatter = Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: CURRENCY_BY_REGION[new Intl.Locale(navigator.language).region ?? 'US'] ?? 'USD'
})
const PercentageFormatter = Intl.NumberFormat(undefined, {
  style: 'percent'
})

/**
 * Given a value and its unit, format it
 * @param value The value
 * @param unit  The unit
 * @returns     The formatted value
 */
function formatValue (value: string | number, unit: ValueUnit | undefined): string {
  if (typeof value === 'string') {
    const number = parseFloat(value)
    if (isNaN(number)) return value

    value = number
  }

  switch (unit) {
    case 'currency': return CurrencyFormatter.format(value)
    case 'percentage': return PercentageFormatter.format(value)
    default: return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
}

const PADDING = 100
const SCROLL_AMNT = 20

/**
 * When dragging a chart, if the Y bounds of the screen are approached, begin scrolling
 * @param e The mouse move event
 */
function onMouseMove (e: MouseEvent): void {
  const scroller = document.getElementById('dash-scroller')
  if (!scroller) return

  if (e.clientY <= (PADDING + scroller.clientTop)) scroller.scrollTop -= SCROLL_AMNT
  else if (e.clientY >= ((scroller.clientTop + scroller.clientHeight) - PADDING)) scroller.scrollTop += SCROLL_AMNT
}

/**
 * A customizable chart to display data
 * @param props
 * @param props.chart         A reference to the chart config
 * @param props.tables        The available tables to use
 * @param props.canQuery      Whether we're good to begin querying rows
 * @param props.className
 * @param props.onContextMenu On chart right-click
 * @param props.onError       On row fetch error
 */
export function Chart ({ chart, tables, canQuery, className, onContextMenu, onError }: { chart: ChartConfig, tables: Partial<Record<string, Table>> | null, canQuery: boolean, onError?: (e: Error | undefined) => void } & Pick<React.ComponentProps<'div'>, 'className' | 'onContextMenu'>): React.ReactNode {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.EChartsType>(undefined)
  const isAnimating = useRef(true)
  const waitingForResize = useRef(false)

  const [resizeCount, setResizeCount] = useState(0)
  const [rows, setRows] = useState<any[]>([])

  const resize = useCallback(() => {
    if (waitingForResize.current) return
    waitingForResize.current = true

    const _resize = (): void => {
      if (!chartRef.current?.isDisposed()) {
        if (isAnimating.current) return void requestAnimationFrame(_resize)

        chartRef.current?.resize()
        setResizeCount((prior) => prior + 1)
      }

      waitingForResize.current = false
    }

    _resize()
  }, [])

  useEffect(() => {
    const theme = {
      backgroundColor: 'var(--color-base-200)',
      textStyle: {
        color: 'var(--color-base-content)'
      },
      title: {
        textStyle: {
          color: 'var(--color-base-content)'
        },
        subtextStyle: {
          color: 'var(--color-base-content)'
        }
      },
      legend: {
        textStyle: {
          color: 'var(--color-base-content)'
        }
      },
      visualMap: {
        textStyle: {
          color: 'var(--color-base-content)'
        }
      },
      tooltip: {
        axisPointer: {
          type: 'line',
          lineStyle: {
            color: 'var(--color-neutral)',
            type: 'dashed'
          },
          crossStyle: {
            color: 'var(--color-neutral)'
          },
          shadowStyle: {
            color: 'var(--color-neutral)'
          }
        },
        backgroundColor: 'var(--color-base-200)',
        borderColor: 'var(--color-neutral)',
        textStyle: {
          color: 'var(--color-base-content)'
        }
      },
      categoryAxis: {
        axisLine: {
          lineStyle: {
            color: 'var(--color-base-content)'
          }
        },
        axisLabel: {
          color: 'var(--color-base-content)'
        },
        splitLine: {
          lineStyle: {
            color: 'var(--color-base-300)'
          }
        }
      },
      valueAxis: {
        axisLine: {
          lineStyle: {
            color: 'var(--color-base-content)'
          }
        },
        axisLabel: {
          color: 'var(--color-base-content)'
        },
        splitLine: {
          lineStyle: {
            color: 'var(--color-base-300)'
          }
        }
      },
      pie: {
        label: {
          color: 'var(--color-base-content)'
        }
      },
      calendar: {
        splitLine: {
          lineStyle: {
            color: 'var(--color-accent)'
          }
        },
        itemStyle: {
          borderColor: 'var(--color-base-200)',
          color: 'var(--color-base-300)'
        },
        dayLabel: {
          color: 'var(--color-base-content)'
        },
        monthLabel: {
          color: 'var(--color-base-content)'
        },
        yearLabel: {
          color: 'var(--color-base-content)'
        }
      }
    }

    const aborter = new AbortController()
    chartRef.current = echarts.init(chartContainerRef.current, theme, { renderer: 'svg' })
    chartRef.current.group = 'dashboard'
    echarts.connect('dashboard')

    const widget = chartContainerRef.current?.closest('.dashup-widget')

    const observer = new ResizeObserver(resize)
    if (widget) observer.observe(widget)
    setTimeout(() => setResizeCount(2), 100) // Fallback if it doesn't resize twice

    chartRef.current.on('finished', () => { isAnimating.current = false })
    let lastZoomClick = Date.now()
    chartRef.current.getZr().on('mousedown', (e: any) => {
      const now = Date.now()

      if (now - lastZoomClick < RESET_ZOOM_DOUBLE_CLICK_LEEWAY_MS && e.target?.cursor === 'crosshair') {
        chartRef.current?.dispatchAction({
          type: 'dataZoom',
          start: 0,
          end: 100
        })
      }

      lastZoomClick = now
    })

    let lastLegendClick: [name: string, timestamp: number] | undefined
    chartRef.current.on('legendselectchanged', (params: any) => {
      if (!(params.name in params.selected)) {
        const selected = structuredClone(params.selected)
        const old = (chartRef.current!.getOption().legend as any)[0]
        chartRef.current!.setOption({
          legend: {
            ...old,
            selected
          }
        }, { replaceMerge: ['legend'] })

        return
      }

      const now = Date.now()
      const isDoubleClick = lastLegendClick && params.name === lastLegendClick[0] && now - lastLegendClick[1] < EXCLUSIVE_LEGEND_DOUBLE_CLICK_LEEWAY_MS

      lastLegendClick = [params.name, now]
      if (!isDoubleClick) return

      for (const series of Object.keys(params.selected)) {
        if (series !== params.name) {
          chartRef.current!.dispatchAction({
            type: 'legendUnSelect',
            name: series
          })
        }
      }

      chartRef.current!.dispatchAction({
        type: 'legendSelect',
        name: params.name
      })
    })

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') chartRef.current?.setOption({ tooltip: { axisPointer: { type: 'cross' } } })
    }, { signal: aborter.signal, passive: true })
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') chartRef.current?.setOption({ tooltip: { axisPointer: { type: 'line' } } })
    }, { signal: aborter.signal, passive: true })

    document.addEventListener('mouseup', () => {
      document.removeEventListener('mousemove', onMouseMove)
    }, { passive: true, signal: aborter.signal })

    return () => {
      aborter.abort()
      chartRef.current?.dispose()
      observer.disconnect()
      document.removeEventListener('mousemove', onMouseMove) // In case it's still registered
    }
  }, [resize])

  useEffect(() => {
    const aborter = new AbortController()

    if (!chart.table || !canQuery) {
      setRows([])
      return
    }

    function query (): void {
      void window.queryRows(chart as typeof chart & { table: string })
        .then((r) => {
          if (aborter.signal.aborted) return

          if (r === null) {
            setRows([])
            onError?.(new Error('No columns selected to query'))
          } else {
            setRows(r)
            onError?.(undefined)
          }
        })
        .catch((err) => {
          setRows([])
          onError?.(new Error(err))
        })
    }

    query()
    window.addEventListener('moduleinstalled', query, { signal: aborter.signal })

    return () => aborter.abort()
  }, [canQuery, chart])

  useEffect(() => {
    isAnimating.current = true

    let isTimeXAxis
    if (chart.forceXAsDate) isTimeXAxis = true
    else if ('xTimeBin' in chart.method && chart.method.xTimeBin === 'weekday') isTimeXAxis = false
    else if (tables && chart.table && 'x' in chart.method && chart.method.x) {
      const x = chart.method.x

      const column = tables[chart.table]?.columns.find((c) => c.identifier === x)
      isTimeXAxis = column?.data_type.includes('date') || column?.data_type.includes('time')
    } else isTimeXAxis = !isNaN(+new Date(rows[0]?.x))

    const figuredType = isTimeXAxis
      ? 'time'
      : 'category'

    chartRef.current?.setOption({
      animation: true,
      title: {
        show: Boolean(chart.table),
        text: chart.title || undefined,
        subtext: chart.subtitle || undefined,
        left: 'center'
      },
      tooltip: {
        trigger: chart.style === 'pie' || chart.style === 'heatmap' ? 'item' : 'axis',
        formatter: chart.style === 'pie'
          ? (params: any) => {
            return `
              ${params.marker}
              ${isTimeXAxis ? params.name : formatValue(params.name, chart.xUnit)}<br/>
              <strong>${formatValue(params.value, chart.yUnit)}</strong> ${chart.yTitle}
              (<strong>${params.percent}%</strong>)
            `
          }
          : chart.style === 'heatmap'
            ? (params: any) => {
              return `
                ${params.marker}
                ${params.value[0].toLocaleDateString()}<br/>
                <strong>${formatValue(params.value[1], chart.yUnit)}</strong> ${chart.yTitle}
              `
            }
            : (params: any) => {
              return `
              ${params[0].axisType.includes('time') ? new Date(params[0].axisValue).toLocaleString() : formatValue(params[0].axisValue, chart.xUnit)}
              <br/>
              ${params
                .map((p: any) => `${p.marker} ${p.seriesName} <strong style="marginLeft:'auto';">${p.seriesType === 'custom'
                  ? p.seriesName === 'Std. Dev.'
                    ? formatValue(p.value[1] - p.value[2], chart.yUnit)
                    : `${formatValue(p.value[2], chart.yUnit)} / ${formatValue(p.value[3], chart.yUnit)}`
                  : formatValue(p.value[1], chart.yUnit)}</strong>`)
                .join('<br/>')}
            `
            }
      },
      legend: {
        show: Boolean(chart.table) && chart.style !== 'heatmap',
        type: 'scroll',
        bottom: 8,
        padding: [0, 30]
      },
      grid: {
        bottom: (figuredType === 'time' ? 105 : 75) + (chart.xLabelAngle && chart.xLabelAngle % 180 ? 16 : 0)
      },
      xAxis: {
        type: figuredType,
        show: Boolean(chart.table) && chart.style !== 'pie' && chart.style !== 'heatmap',
        name: !canQuery || !chart.table || chart.style === 'pie' ? undefined : chart.xTitle,
        nameLocation: 'center',
        nameGap: 30,
        nameTextStyle: {
          fontWeight: 'bold'
        },
        axisLabel: {
          hideOverlap: true,
          rotate: chart.xLabelAngle,
          formatter: isTimeXAxis ? undefined : (v: string | number) => formatValue(v, chart.xUnit)
        }
      },
      yAxis: {
        type: 'value',
        show: Boolean(chart.table) && chart.style !== 'pie' && chart.style !== 'heatmap',
        name: !canQuery || !chart.table ? undefined : chart.yTitle,
        nameLocation: 'center',
        nameTextStyle: {
          fontWeight: 'bold'
        },
        axisLabel: {
          formatter: (v: string | number) => formatValue(v, chart.yUnit)
        }
      },
      dataZoom: {
        show: figuredType === 'time' && chart.style !== 'pie' && chart.style !== 'heatmap',
        type: 'slider',
        xAxisIndex: [0],
        filterMode: 'filter',
        bottom: 38,
        height: '5%',
        labelFormatter: (v, aV) => new Date(aV).toLocaleDateString(undefined, { dateStyle: 'short' })
      },
      color: DEFAULT_TRACE_COLORS.map((c, i) => chart.traceColors?.[i] ?? c)
    } satisfies echarts.EChartsOption)
  }, [
    canQuery,
    rows,
    tables,
    chart.table,
    chart.title,
    chart.subtitle,
    chart.xTitle,
    chart.yTitle,
    chart.method,
    chart.style,
    chart.traceColors,
    chart.xUnit,
    chart.yUnit,
    chart.xLabelAngle,
    chart.forceXAsDate
  ])

  // Need to wait for 2 resizes or animations break (Waiting for 0 causes resize to interrupt opening anim. Waiting for 1 causes anim to interrupt resize and the chart remains small)
  const showData = resizeCount >= 2
  useEffect(() => {
    if (!canQuery || !showData) return

    isAnimating.current = true

    const series: echarts.SeriesOption[] = []

    const shouldAccumulate = chart.cumulative && chart.style !== 'pie' && chart.method.type !== 'custom'

    let heatmapMin = Infinity
    let heatmapMax = 0
    const heatmapSeries = new Map<number, echarts.HeatmapSeriesOption>()
    const isWeekdayXAxis = 'xTimeBin' in chart.method && chart.method.xTimeBin === 'weekday'
    const grouped = chart.breakdown ? Object.groupBy(rows, (r) => r.group) : { [chart.yTitle]: rows }
    for (const group in grouped) {
      const groupRows = grouped[group]!

      let accumulator = 0
      if (chart.style === 'heatmap') {
        for (const r of groupRows) {
          const value = shouldAccumulate ? (accumulator += parseFloat(r.y)) : parseFloat(r.y)
          if (value > heatmapMax) heatmapMax = value
          if (value < heatmapMin) heatmapMin = value

          const date = new Date(r.x)
          const year = date.getFullYear()

          let serus = heatmapSeries.get(year)
          if (!serus) {
            serus = {
              type: 'heatmap',
              coordinateSystem: 'calendar',
              calendarIndex: heatmapSeries.size,
              data: [],
              emphasis: {
                itemStyle: {
                  borderWidth: 3,
                  shadowBlur: 10
                }
              }
            }
            heatmapSeries.set(year, serus)
          }

          serus.data!.push({
            value: [date, value],
            itemStyle: r.style
          })
        }

        for (const serus of heatmapSeries.values()) series.push(serus)
      } else {
        series.push({
          name: group,
          type: chart.style,
          data: chart.style === 'pie'
            ? groupRows
              .map((r) => ({
                name: isWeekdayXAxis ? getWeekdayName(r.x) : r.x,
                value: parseFloat(r.y),
                itemStyle: r.style
              })).sort((a, b) => b.value - a.value)
            : groupRows
              .map((r) => {
                const value = shouldAccumulate ? (accumulator += parseFloat(r.y)) : parseFloat(r.y)
                if (value > heatmapMax) heatmapMax = value
                if (value < heatmapMin) heatmapMin = value
                return {
                  value: [isWeekdayXAxis ? getWeekdayName(r.x) : r.x, value],
                  itemStyle: r.style
                }
              }),
          universalTransition: true
        })
      }

      if ((chart.style !== 'pie' && chart.style !== 'heatmap' && !chart.cumulative && chart.method.type === 'aggregate_avg' && chart.method.bars) || chart.method.type === 'custom') {
        series.push({
          type: 'custom',
          name: chart.method.type === 'aggregate_avg'
            ? chart.method.bars === 'stddev'
              ? 'Std. Dev.'
              : 'Min / Max'
            : 'Error',
          renderItem: errorBoundRender,
          color: chart.barColor ?? DEFAULT_BAR_COLOR,
          data: groupRows[0] && 'lowBar' in groupRows[0] && 'highBar' in groupRows[0]
            ? groupRows
              .map((r) => ({
                value: [isWeekdayXAxis ? getWeekdayName(r.x) : r.x, parseFloat(r.y), parseFloat(r.lowBar), parseFloat(r.highBar)]
              }))
            : undefined,
          itemStyle: {
            borderWidth: 1.5
          },
          encode: { x: 0, y: [2, 3] },
          universalTransition: true,
          zlevel: 1
        })
      }
    }

    const oldOptions: any = chartRef.current?.getOption()
    const oldGraphic = oldOptions?.graphic
    const oldLength = oldOptions?.series?.length ?? 0
    const oldCalendar = oldOptions?.calendar

    function getPieTotalString (selected?: Record<string, boolean>): string {
      selected ??= (chartRef.current?.getOption().legend as any)?.selected ?? {}

      const allSelected = !Object.keys(selected).length

      return `{label|Total ${chart.yTitle}:} {value|${formatValue(rows.reduce((a, r) => allSelected || selected?.[r.x] ? a + parseFloat(r.y) : a, 0), chart.yUnit)}}`
    }

    const toReplace: string[] = []
    if (oldLength > series.length) toReplace.push('series')
    if (oldCalendar?.length && chart.style !== 'heatmap') toReplace.push('calendar', 'visualMap')
    if (Boolean(oldGraphic) !== (chart.style === 'pie')) toReplace.push('graphic')

    chartRef.current?.setOption({
      xAxis: chart.style === 'pie'
        ? undefined
        : { data: isWeekdayXAxis ? Array.from({ length: 7 }, (_, i) => getWeekdayName(i)) : rows.map((r) => r.x) },
      series,
      calendar: chart.style === 'heatmap'
        ? Array.from(heatmapSeries.keys())
          .sort((a, b) => a - b)
          .map((y, i) => ({
            range: y,
            top: 80 + (180 * i),
            cellSize: 15
          }))
        : [],
      visualMap: chart.style === 'heatmap'
        ? {
          min: heatmapMin,
          max: heatmapMax,
          inRange: {
            color: Array.from({ length: 3 }, (_, i) => chart.traceColors?.[i] ?? DEFAULT_HEATMAP_COLORS[i])
          },
          outOfRange: {
            color: 'gray'
          },
          formatter: (v: string | number) => formatValue(v, chart.yUnit),
          orient: 'horizontal',
          left: 40,
          calculable: true
        }
        : undefined,
      graphic: chart.style === 'pie'
        ? {
          type: 'text',
          left: 10,
          top: 40,
          style: {
            text: getPieTotalString(),
            rich: {
              value: {
                fontWeight: 'bold'
              }
            },
            fill: 'var(--color-base-content)',
            fontSize: 10
          },
          cursor: 'default',
          enterFrom: {
            style: { opacity: 0 }
          },
          enterAnimation: {
            duration: 300
          }
        }
        : undefined
    }, { replaceMerge: toReplace })

    if (chart.style === 'pie') {
      function updatePieTotal (params: any): void {
        chartRef.current?.setOption({
          graphic: {
            style: {
              text: getPieTotalString(params.selected)
            }
          }
        })
      }

      chartRef.current?.on('legendselectchanged', updatePieTotal)

      return () => {
        if (!chartRef.current?.isDisposed()) chartRef.current?.off('legendselectchanged', updatePieTotal)
      }
    }
  }, [
    canQuery,
    showData,
    rows,
    chart.yTitle,
    chart.style,
    chart.method,
    chart.traceColors,
    chart.barColor,
    chart.breakdown,
    chart.cumulative,
    chart.yUnit
  ])

  return (
    <>
      <div className='transition-opacity absolute inset-x-0 flex justify-center bg-base-200 handle cursor-grab opacity-0 z-10 [.dashup-widget:hover_&]:opacity-100 [.dashup-widget[data-editing]_&]:hidden rounded-t-[5px]' onMouseDown={() => document.addEventListener('mousemove', onMouseMove, { passive: true })}>
        <MdDragHandle />
      </div>

      <div
        ref={chartContainerRef}
        className={twMerge('flex w-full h-full min-w-1 min-h-1 select-none rounded-[5px] *:rounded-[5px]', className)}
        onContextMenu={onContextMenu}
        onDoubleClick={(e) => e.stopPropagation()}
      />

      <div className={twMerge('absolute inset-0 flex justify-center items-center text-center text-lg font-bold text-base-content/50 pointer-events-none select-none', chart.table && 'hidden')}>Right click on me to edit my properties!</div>
    </>
  )
}
