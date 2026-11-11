import React from 'react';
import { LogIn, Users } from 'lucide-react';

export default function LoginScreen({ onGoogle, loading, message }) {
  return <div className="login-page"><div className="login-card">
    <div className="login-brand-mark"><Users size={30}/></div>
    <p className="login-eyebrow">COMPUTER SOFTWARE ENGINEERING</p>
    <h1>졸업생관리프로그램</h1>
    <p className="login-description">졸업생 정보와 이력을 통합 관리합니다.</p>
    <div className="login-divider"/><p className="login-guide">Google 계정으로 로그인해 주세요.</p>
    <button className="google-login" onClick={onGoogle} disabled={loading}><LogIn size={19}/> Google 계정으로 로그인</button>
    {message && <p className="login-message" role="alert">{message}</p>}
    <span className="login-security">관리자가 등록한 계정만 사용할 수 있습니다.</span>
  </div></div>;
}
