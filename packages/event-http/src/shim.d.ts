/* eslint-disable import/no-default-export */
declare module '*.tl.html' {
  const templateFunction: (ctx: object) => string
  export default templateFunction
}
declare module '*.tl.svg' {
  const templateFunction: (ctx: object) => string
  export default templateFunction
}
