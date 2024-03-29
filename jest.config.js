import { dye } from '@prostojs/dye'
import path from 'path'
import { fileURLToPath } from 'url'

export const __filename = fileURLToPath(import.meta.url)
export const __dirname = path.dirname(__filename)

export default {
  preset: 'ts-jest',
  moduleFileExtensions: ['ts', 'js'],
  rootDir: __dirname,
  testRegex: '.spec.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  coverageDirectory: 'coverage',
  coverageReporters: ['html', 'lcov', 'text'],
  collectCoverageFrom: ['packages/**/src/**/*.ts'],
  watchPathIgnorePatterns: ['/node_modules/', '/dist/', '/.git/'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@wooksjs/(.*?)$': '<rootDir>/packages/$1/src',
    '^wooks$': '<rootDir>/packages/wooks/src',
    '^common/(.*?)$': '<rootDir>/common/$1',
  },
  globals: {
    __DYE_RED_BRIGHT__: dye('red-bright').open,
    __DYE_BOLD__: dye('bold').open,
    __DYE_RESET__: dye.reset,
    __DYE_RED__: dye('red').open,
    __DYE_CYAN__: dye('cyan').open,
    __DYE_COLOR_OFF__: dye('red').close,
    __DYE_GREEN__: dye('green').open,
    __DYE_GREEN_BRIGHT__: dye('green-bright').open,
    __DYE_BLUE__: dye('blue').open,
    __DYE_YELLOW__: dye('yellow').open,
    __DYE_DIM__: dye('dim').open,
    __DYE_DIM_OFF__: dye('dim').close,
    __VERSION__: 'JEST_TEST',
    __PROJECT__: 'jest-test',
  },
}
