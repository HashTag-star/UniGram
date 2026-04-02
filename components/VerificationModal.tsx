
import React, { useState } from 'react';
import { X, CheckCircle, Upload, GraduationCap, BookOpen, Users, Star, Shield, ChevronRight, AlertCircle } from 'lucide-react';
import { VerificationType } from '../types';

interface VerificationModalProps {
  onClose: () => void;
}

type Step = 'select' | 'form' | 'success';

interface VerificationTier {
  type: VerificationType;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badgeColor: string;
  requirements: string[];
}

const TIERS: VerificationTier[] = [
  {
    type: 'student',
    icon: <GraduationCap className="w-6 h-6" />,
    title: 'Verified Student',
    subtitle: 'For enrolled students',
    badgeColor: 'bg-blue-500',
    requirements: ['Valid .edu email address', 'Student ID or enrollment proof', 'University name matches profile'],
  },
  {
    type: 'professor',
    icon: <BookOpen className="w-6 h-6" />,
    title: 'Verified Faculty',
    subtitle: 'For professors & teaching staff',
    badgeColor: 'bg-yellow-500',
    requirements: ['University faculty email', 'Faculty ID or appointment letter', 'Department listed on profile'],
  },
  {
    type: 'club',
    icon: <Users className="w-6 h-6" />,
    title: 'Verified Organization',
    subtitle: 'For clubs, orgs & societies',
    badgeColor: 'bg-purple-500',
    requirements: ['Official club/org status documentation', 'University recognition letter', 'At least 10 active members'],
  },
  {
    type: 'influencer',
    icon: <Star className="w-6 h-6" />,
    title: 'Notable Account',
    subtitle: 'For campus creators & influencers',
    badgeColor: 'bg-blue-500',
    requirements: ['1,000+ followers', 'Consistent posting history', 'Notable campus presence'],
  },
];

export const VerificationModal: React.FC<VerificationModalProps> = ({ onClose }) => {
  const [step, setStep] = useState<Step>('select');
  const [selectedTier, setSelectedTier] = useState<VerificationTier | null>(null);
  const [fullName, setFullName] = useState('');
  const [eduEmail, setEduEmail] = useState('');
  const [reason, setReason] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!fullName || !eduEmail || !agreed) return;
    setIsSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    setIsSubmitting(false);
    setStep('success');
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#111] border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 sticky top-0 bg-[#111] z-10">
          <button
            onClick={step === 'form' ? () => setStep('select') : onClose}
            className="p-1 hover:bg-white/10 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-base">Get Verified</h3>
          </div>
          <div className="w-7" />
        </div>

        {step === 'select' && (
          <div className="p-4">
            <p className="text-white/50 text-sm text-center mb-6">
              Choose the verification that applies to you. Each comes with a unique badge on your profile and posts.
            </p>
            <div className="space-y-3">
              {TIERS.map(tier => (
                <button
                  key={tier.type}
                  onClick={() => { setSelectedTier(tier); setStep('form'); }}
                  className="w-full flex items-center gap-4 p-4 bg-white/5 hover:bg-white/8 border border-white/10 hover:border-indigo-500/40 rounded-2xl text-left transition-all group"
                >
                  <div className={`w-12 h-12 rounded-2xl ${tier.badgeColor} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                    {tier.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-bold text-sm">{tier.title}</span>
                      <div className={`w-4 h-4 rounded-full ${tier.badgeColor} flex items-center justify-center`}>
                        <span className="text-[8px] text-white font-bold">✓</span>
                      </div>
                    </div>
                    <p className="text-xs text-white/50">{tier.subtitle}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/60 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'form' && selectedTier && (
          <div className="p-4">
            {/* Selected tier badge */}
            <div className={`flex items-center gap-3 p-3 rounded-2xl ${selectedTier.badgeColor}/10 border border-white/10 mb-6`}>
              <div className={`w-10 h-10 rounded-xl ${selectedTier.badgeColor} flex items-center justify-center`}>
                {selectedTier.icon}
              </div>
              <div>
                <p className="font-bold text-sm">{selectedTier.title}</p>
                <p className="text-xs text-white/50">{selectedTier.subtitle}</p>
              </div>
            </div>

            {/* Requirements */}
            <div className="mb-6 bg-white/3 rounded-2xl p-3">
              <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">Requirements</p>
              {selectedTier.requirements.map((req, i) => (
                <div key={i} className="flex items-start gap-2 mb-1.5">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-white/70">{req}</span>
                </div>
              ))}
            </div>

            {/* Form */}
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-white/50 mb-1 block">Full Legal Name *</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Your full name as it appears on your ID"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/50 mb-1 block">University Email (.edu) *</label>
                <input
                  type="email"
                  value={eduEmail}
                  onChange={e => setEduEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/50 mb-1 block">Why should you be verified?</label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Tell us why this verification applies to you..."
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                />
              </div>
              <button className="w-full flex items-center gap-2 p-3 border border-dashed border-white/20 rounded-xl text-white/40 hover:text-white/70 hover:border-white/40 transition-all text-sm">
                <Upload className="w-4 h-4" />
                Upload supporting document (optional)
              </button>
            </div>

            <div className="flex items-start gap-2 mt-4 mb-6">
              <button
                className={`w-5 h-5 rounded-md border flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${agreed ? 'bg-indigo-600 border-indigo-600' : 'border-white/30'}`}
                onClick={() => setAgreed(!agreed)}
              >
                {agreed && <span className="text-white text-[10px]">✓</span>}
              </button>
              <p className="text-xs text-white/50 leading-relaxed">
                I confirm that the information provided is accurate and I am eligible for this verification. False claims may result in account suspension.
              </p>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!fullName || !eduEmail || !agreed || isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-white/10 disabled:text-white/30 text-white font-bold py-3 rounded-2xl transition-all"
            >
              {isSubmitting ? 'Submitting application...' : 'Submit Verification Request'}
            </button>

            <div className="flex items-start gap-2 mt-3">
              <AlertCircle className="w-3.5 h-3.5 text-white/30 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-white/30">Review typically takes 3-5 business days. You'll receive a notification with the decision.</p>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-green-400" />
            </div>
            <h3 className="text-xl font-bold mb-2">Application Submitted!</h3>
            <p className="text-white/50 text-sm mb-2">
              Your {selectedTier?.title} verification request has been submitted.
            </p>
            <p className="text-white/40 text-xs mb-8">
              We'll review your application and notify you within 3-5 business days.
            </p>
            <button
              onClick={onClose}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-8 py-3 rounded-2xl transition-all"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
