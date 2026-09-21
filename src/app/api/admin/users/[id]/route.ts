import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyToken } from '@/lib/jwt';
import type { NextRequest } from 'next/server';

async function checkAdmin(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  if (!token) return false;
  const payload = await verifyToken(token);
  return payload?.role === 'admin';
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
  try {
    const { id } = await params;
    const body = await req.json();
    const { role } = body;

    const { error } = await supabaseAdmin
      .from('system_users')
      .update({ role })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await checkAdmin(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin
      .from('system_users')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
