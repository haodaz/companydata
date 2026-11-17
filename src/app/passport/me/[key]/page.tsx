import { redirect } from 'next/navigation';

/** 旧的专属链接一律改走登录：/passport/me（没登录会先去登录页） */
export default function OldOwnerLink() {
  redirect('/passport/me');
}
