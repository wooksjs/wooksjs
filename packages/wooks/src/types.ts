export interface TWooksOptions {

}

export type TWooksHandler<ResType = unknown> = () => Promise<ResType> | ResType
