import { convertTime } from '../time'

describe('time', () => {
    it('must convert milliseconds', () => {
        expect(convertTime('15ms')).toEqual(15)
    })
    it('must convert seconds', () => {
        expect(convertTime('15s')).toEqual(15000)
    })
    it('must convert minutes', () => {
        expect(convertTime('15m')).toEqual(15000 * 60)
    })
    it('must convert hours', () => {
        expect(convertTime('15h')).toEqual(15000 * 60 * 60)
    })
    it('must convert days', () => {
        expect(convertTime('15d')).toEqual(15000 * 60 * 60 * 24)
    })
    it('must convert weeks', () => {
        expect(convertTime('15w')).toEqual(15000 * 60 * 60 * 24 * 7)
    })
    it('must convert months', () => {
        expect(convertTime('15M')).toEqual(15000 * 60 * 60 * 24 * 30)
    })
    it('must convert years', () => {
        expect(convertTime('15Y')).toEqual(15000 * 60 * 60 * 24 * 365)
    })
    it('must convert complex time', () => {
        expect(convertTime('2h 13m 16s 14ms')).toEqual(16 * 1000 + 13 * 1000 * 60 + 2 * 1000 * 60 * 60 + 14)
    })
    it('must convert number', () => {
        expect(convertTime(225)).toEqual(225)
    })
    it('must convert number to seconds', () => {
        expect(convertTime(5000, 's')).toEqual(5)
    })
    it('must convert number to minutes', () => {
        expect(convertTime('600s', 'm')).toEqual(10)
    })
    it('must convert number to hours', () => {
        expect(convertTime('30m', 'h')).toEqual(.5)
    })
    it('must convert number to days', () => {
        expect(convertTime('36h', 'd')).toEqual(1.5)
    })
})
