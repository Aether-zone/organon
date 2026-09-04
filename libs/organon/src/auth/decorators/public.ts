import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'organon:isPublic';

/** Opts a route out of the global token requirement. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
