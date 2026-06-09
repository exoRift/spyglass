import * as echarts from 'echarts'

import { useCallback, useEffect, useRef, useState } from 'react'
import { twMerge } from 'tailwind-merge'

import type { Column } from 'knex-schema-inspector/dist/types/column'
import { DEFAULT_BARS_COLOR, DEFAULT_TRACE_COLORS, type Chart as ChartConfig } from '../../lib/config'

import { MdDragHandle } from 'react-icons/md'

const errorBoundRender: echarts.CustomSeriesRenderItem = function (params, api) {
  const xValue = api.value(0)
  const lowPoint = api.coord([xValue, api.value(2)])
  const highPoint = api.coord([xValue, api.value(3)])
  // const width = (api.size!([0, 1]) as [number, number])[0] * 0.4
  const width = 5
  const color = api.visual('color')

  const lineStyle = {
    stroke: color,
    lineWidth: 2
  }

  return {
    type: 'group',
    children: [
      {
        type: 'line',
        shape: {
          x1: highPoint[0],
          y1: highPoint[1],
          x2: lowPoint[0],
          y2: lowPoint[1]
        },
        style: lineStyle
      },
      {
        type: 'line',
        shape: {
          x1: highPoint[0]! - width,
          y1: highPoint[1],
          x2: highPoint[0]! + width,
          y2: highPoint[1]
        },
        style: lineStyle
      },
      {
        type: 'line',
        shape: {
          x1: lowPoint[0]! - width,
          y1: lowPoint[1],
          x2: lowPoint[0]! + width,
          y2: lowPoint[1]
        },
        style: lineStyle
      }
    ]
  }
}

export function Chart ({ chart, tables, canQuery, className, onContextMenu, onError }: { chart: ChartConfig, tables: Partial<Record<string, Column[]>> | null, canQuery: boolean, onError?: (e: Error | undefined) => void } & Pick<React.ComponentProps<'div'>, 'className' | 'onContextMenu'>): React.ReactNode {
  const chartContainer = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.EChartsType>(undefined)
  const isAnimating = useRef(true)
  const waitingForResize = useRef(false)

  const [rows, setRows] = useState<any[]>([])

  const waitForAnimationToFinish = useCallback(() => new Promise<void>((_resolve) => {
    const resolve = (): void => {
      chartRef.current?.off('finished', resolve)
      _resolve()
    }

    if (isAnimating.current) chartRef.current?.on('finished', resolve)
    else _resolve()
  }), [])

  const resize = useCallback(() => {
    if (waitingForResize.current) return
    waitingForResize.current = true

    void waitForAnimationToFinish().then(() => {
      requestAnimationFrame(() => {
        chartRef.current?.resize()
        waitingForResize.current = false
      })
    })
  }, [waitForAnimationToFinish])

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
      }
    }

    const aborter = new AbortController()
    chartRef.current = echarts.init(chartContainer.current, theme, { renderer: 'svg' })
    chartRef.current.group = 'dashboard'
    echarts.connect('dashboard')

    const widget = chartContainer.current?.closest('.dashup-widget')

    const observer = new ResizeObserver(resize)
    if (widget) observer.observe(widget)

    function onFinished (): void {
      isAnimating.current = false
    }

    chartRef.current.on('finished', onFinished)

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Shift') chartRef.current?.setOption({ tooltip: { axisPointer: { type: 'cross' } } })
    }, { signal: aborter.signal, passive: true })
    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') chartRef.current?.setOption({ tooltip: { axisPointer: { type: 'line' } } })
    }, { signal: aborter.signal, passive: true })

    return () => {
      aborter.abort()
      chartRef.current?.off('finished', onFinished)
      chartRef.current?.dispose()
      observer.disconnect()
    }
  }, [resize])

  useEffect(() => {
    const aborter = new AbortController()

    if (!chart.table || !canQuery) {
      setRows([])
      return
    }

    void queryRows(chart as typeof chart & { table: string })
      .then((r) => {
        if (aborter.signal.aborted) return

        if (typeof r === 'string') {
          setRows([])
          onError?.(new Error(r))
        } else if (r === null) {
          setRows([])
          onError?.(new Error('Failed to fetch data'))
        } else {
          setRows(r)
          onError?.(undefined)
        }
      })

    return () => aborter.abort()
  }, [canQuery, chart, (+chart - +chart.pos)])

  useEffect(() => {
    isAnimating.current = true

    let isTimeXAxis
    if (tables && chart.table && 'x' in chart.method && chart.method.x) {
      const x = chart.method.x

      const column = tables[chart.table]?.find((c) => c.name === x)
      isTimeXAxis = column?.data_type.includes('date') || column?.data_type.includes('time')
    } else isTimeXAxis = !isNaN(+new Date(rows[0]?.x))

    const figuredType = isTimeXAxis
      ? 'time'
      : 'category'
    chartRef.current?.setOption({
      animation: true,
      title: {
        text: chart.title || undefined,
        subtext: chart.subtitle || undefined,
        left: 'center'
      },
      tooltip: {
        trigger: chart.style === 'pie' ? 'item' : 'axis',
        formatter: chart.style === 'pie'
          ? (params: any) => {
            return `
              ${params.marker}
              ${params.name}<br/>
              <strong>${params.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
              (<strong>${params.percent}%</strong>)
            `
          }
          : (params: any) => {
            return `
              ${params[0].axisType.includes('time') ? new Date(params[0].axisValue).toLocaleString() : params[0].axisValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <br/>
              ${params
                .map((p: any) => `${p.marker} ${p.seriesName} <strong style="marginLeft:'auto';">${p.seriesType === 'custom'
                  ? p.seriesName === 'Std. Dev.'
                    ? (p.value[1] - p.value[2]).toLocaleString(undefined, { maximumFractionDigits: 2 })
                    : `${p.value[2].toLocaleString(undefined, { maximumFractionDigits: 2 })} / ${p.value[3].toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  : p.value[1].toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>`)
                .join('<br/>')}
            `
          }
      },
      legend: {
        show: true,
        bottom: 8
      },
      grid: {
        bottom: figuredType === 'time' ? 105 : 75
      },
      xAxis: {
        name: chart.style === 'pie' ? undefined : chart.xTitle,
        nameLocation: 'center',
        nameGap: 30,
        nameTextStyle: {
          fontWeight: 'bold'
        },
        type: figuredType,
        axisLabel: {
          hideOverlap: true
        }
      },
      yAxis: {
        type: 'value',
        nameLocation: 'center',
        nameTextStyle: {
          fontWeight: 'bold'
        },
        name: chart.yTitle
      },
      dataZoom: figuredType === 'time' && chart.style !== 'pie'
        ? {
          type: 'slider',
          xAxisIndex: [0],
          filterMode: 'filter',
          bottom: 38,
          height: '5%',
          labelFormatter: (v, aV) => new Date(aV).toLocaleDateString(undefined, { dateStyle: 'short' })
        }
        : undefined,
      color: DEFAULT_TRACE_COLORS.map((c, i) => chart.traceColors?.[i] ?? c)
    } satisfies echarts.EChartsOption)
  }, [rows, tables, chart.table, chart.title, chart.subtitle, chart.method, chart.style, chart.traceColors, waitForAnimationToFinish])

  useEffect(() => {
    if (!canQuery) return

    isAnimating.current = true

    const series: echarts.SeriesOption[] = []

    const grouped = chart.breakdown ? Object.groupBy(rows, (r) => r.group) : { [chart.yTitle]: rows }
    for (const group in grouped) {
      const groupRows = grouped[group]!

      series.push({
        name: group,
        type: chart.style,
        data: chart.style === 'pie'
          ? groupRows.map((r) => ({ name: r.x, value: parseFloat(r.y) })).sort((a, b) => b.value - a.value)
          : groupRows.map((r) => ({ value: [r.x, parseFloat(r.y)] })),
        universalTransition: true
      })

      if (chart.style !== 'pie' && ((chart.method.type === 'aggregate_avg' && chart.method.bars) || (chart.method.type === 'custom' && groupRows[0] && 'lowBar' in groupRows[0] && 'highBar' in groupRows[0]))) {
        series.push({
          type: 'custom',
          name: chart.method.type === 'aggregate_avg'
            ? chart.method.bars === 'stddev'
              ? 'Std. Dev.'
              : 'Min / Max'
            : 'Error',
          renderItem: errorBoundRender,
          color: chart.barColor ?? DEFAULT_BARS_COLOR,
          data: groupRows.map((r) => ({ value: [r.x, parseFloat(r.y), parseFloat(r.lowBar), parseFloat(r.highBar)] })),
          itemStyle: {
            borderWidth: 1.5
          },
          encode: { x: 0, y: [2, 3] },
          universalTransition: true,
          zlevel: 1
        })
      }
    }

    const oldLength = (chartRef.current?.getOption() as any)?.series?.length ?? 0

    chartRef.current?.setOption({
      xAxis: chart.style === 'pie'
        ? undefined
        : { data: rows.map((r) => r.x) },
      series
    }, { replaceMerge: oldLength > series.length ? 'series' : undefined })
  }, [chart.style, chart.method, rows, chart.traceColors, chart.barColor, chart.breakdown, waitForAnimationToFinish, canQuery])

  return (
    <>
      <div className='transition-opacity absolute inset-x-0 flex justify-center bg-base-200 handle cursor-grab opacity-0 z-10 [.dashup-widget:hover_&]:opacity-100 [.dashup-widget[data-editing]_&]:hidden'>
        <MdDragHandle />
      </div>

      <div className={twMerge('flex h-full select-none', className)} onContextMenu={onContextMenu} onDoubleClick={(e) => e.stopPropagation()}>
        <div className='w-0 grow flex flex-col'>
          <div className='h-0 grow' ref={chartContainer} />
        </div>
      </div>

      <div className={twMerge('absolute inset-0 flex justify-center items-center text-center text-lg font-bold text-base-content/50 pointer-events-none select-none', chart.table && 'hidden')}>Right click on me to edit my properties!</div>
    </>
  )
}
