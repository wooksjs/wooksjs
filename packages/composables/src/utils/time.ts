export type TProstoTimeUnit = 'ms' | 's' | 'm' | 'h' | 'd' | 'w' | 'M' | 'Y'
export type TProstoTimeSingleString = `${number}${TProstoTimeUnit}`
export type TProstoTimeMultiString = `${TProstoTimeSingleString}${TProstoTimeSingleString | ''}${TProstoTimeSingleString | ''}${TProstoTimeSingleString | ''}`

export function convertTime(time: number | TProstoTimeMultiString, unit: TProstoTimeUnit = 'ms') {
    if (typeof time === 'number') return time / units[unit]
    const rg = /(\d+)(\w+)/g
    let t = 0
    let r
    while (r = rg.exec(time)) {
        t += Number(r[1]) * (units[r[2] as TProstoTimeUnit] || 0)
    }
    return t / units[unit]
}

const units: Record<TProstoTimeUnit, number> = {
    ms: 1,
    s: 1000,
    m: 1000 * 60,
    h: 1000 * 60 * 60,
    d: 1000 * 60 * 60 * 24,
    w: 1000 * 60 * 60 * 24 * 7,
    M: 1000 * 60 * 60 * 24 * 30,
    Y: 1000 * 60 * 60 * 24 * 365,
}
