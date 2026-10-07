import {getSessionCookie} from 'better-auth/cookies';
import {NextResponse, type NextRequest} from 'next/server';

// Optimistic check only (cookie present). Real authorization happens in each page / handler via requireUser().
export function proxy(request: NextRequest) {
	if (!getSessionCookie(request)) {
		const url = new URL('/sign-in', request.url);
		url.searchParams.set('next', request.nextUrl.pathname);
		return NextResponse.redirect(url);
	}
	return NextResponse.next();
}

export const config = {
	matcher: ['/dashboard/:path*', '/projects/:path*', '/settings/:path*'],
};
