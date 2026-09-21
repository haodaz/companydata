import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyToken } from '@/lib/jwt';
import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const payload = await verifyToken(token);
    if (payload?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('system_users')
      .select('id, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
