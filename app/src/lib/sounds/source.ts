/**
 * Wikimedia serves media only to clients that identify themselves, so every
 * request for a recording carries this User-Agent. Swap the contact for a
 * project URL once there is a public one.
 */
export const MEDIA_USER_AGENT = 'Fluttr/1.0 (bird watching app; j.c.hollyer@gmail.com)';

export const MEDIA_HEADERS = { 'User-Agent': MEDIA_USER_AGENT };
