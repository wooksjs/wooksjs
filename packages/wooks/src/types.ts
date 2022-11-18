import { BaseWooksResponse } from '@wooksjs/composables'

export interface TWooksOptions {

}

export type TWooksHandler<ResType = unknown> = () 
    => Promise<ResType> | ResType | Error | Promise<Error> | BaseWooksResponse<ResType> | Promise<BaseWooksResponse<ResType>>
