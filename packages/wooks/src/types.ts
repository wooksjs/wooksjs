import { BaseWooksResponse } from '@wooksjs/event-http'

export interface TWooksOptions {

}

export type TWooksHandler<ResType = unknown> = () 
    => Promise<ResType> | ResType | Error | Promise<Error> | BaseWooksResponse<ResType> | Promise<BaseWooksResponse<ResType>>
