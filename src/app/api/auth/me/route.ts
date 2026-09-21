import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get('cookie') || '';
    const match = cookieHeader.match(/auth_token=([^;]+)/);
    if (!match) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    const token = match[1];
    const payload = await verifyToken(token);
    
    if (!payload) {
      return NextResponse.json({ success: false, user: null }, { status: 401 });
    }

    return NextResponse.json({ success: true, user: payload });
  } catch (error) {
    return NextResponse.json({ success: false, user: null }, { status: 500 });
  }
}
