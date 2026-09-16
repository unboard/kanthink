import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, X, ArrowLeft, Heart, Repeat, MessageCircle, Share, BarChart3, Bookmark, Loader2, Link2, MoreHorizontal } from 'lucide-react';

const AVATAR_COLORS = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 
  'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
];

const XLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-white">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

const generateStats = (isViral) => {
  if (isViral) {
    return {
      views: Math.floor(Math.random() * 2000000) + 100000,
      likes: Math.floor(Math.random() * 50000) + 1000,
      reposts: Math.floor(Math.random() * 10000) + 100,
      replies: Math.floor(Math.random() * 2000) + 50,
      bookmarks: Math.floor(Math.random() * 5000) + 50,
    };
  }
  return {
    views: Math.floor(Math.random() * 500) + 10,
    likes: Math.floor(Math.random() * 3),
    reposts: 0,
    replies: Math.floor(Math.random() * 2),
    bookmarks: 0,
  };
};

const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

export default function App() {
  const [view, setView] = useState('composer'); // 'composer', 'loading', 'post'
  const [text, setText] = useState('');
  const [image, setImage] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const [postData, setPostData] = useState(null);
  const [currentStats, setCurrentStats] = useState({ views: 0, likes: 0, reposts: 0, replies: 0, bookmarks: 0 });
  const [visibleReplies, setVisibleReplies] = useState([]);
  const [shareUrl, setShareUrl] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Check for hydrated data (shared link)
  useEffect(() => {
    if (window.kanthinkInitial?.record?.data) {
      setPostData(window.kanthinkInitial.record.data);
      setView('post');
    }
  }, []);

  // Animate metrics and reveal replies sequentially
  useEffect(() => {
    if (view === 'post' && postData) {
      setCurrentStats({ views: 0, likes: 0, reposts: 0, replies: 0, bookmarks: 0 });
      setVisibleReplies([]);

      const duration = 3000;
      const steps = 60;
      const interval = duration / steps;
      let step = 0;

      const statTimer = setInterval(() => {
        step++;
        const progress = Math.min(step / steps, 1);
        const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);

        setCurrentStats({
          views: Math.floor(postData.stats.views * easeProgress),
          likes: Math.floor(postData.stats.likes * easeProgress),
          reposts: Math.floor(postData.stats.reposts * easeProgress),
          replies: Math.floor(postData.stats.replies * easeProgress),
          bookmarks: Math.floor(postData.stats.bookmarks * easeProgress),
        });

        if (step >= steps) {
          clearInterval(statTimer);
        }
      }, interval);

      const replyTimer = setInterval(() => {
        setVisibleReplies(prev => {
          if (prev.length < postData.replies.length) {
            return [...prev, postData.replies[prev.length]];
          }
          clearInterval(replyTimer);
          return prev;
        });
      }, 800);

      return () => {
        clearInterval(statTimer);
        clearInterval(replyTimer);
      };
    }
  }, [view, postData]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const { url } = await window.kanthinkUpload(file);
      setImage(url);
    } catch (err) {
      alert("Couldn't upload image. Try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handlePost = async () => {
    if (!text.trim() && !image) return;
    setView('loading');
    
    const isViral = Math.random() > 0.4; // 60% chance of viral for dopamine hit
    const stats = generateStats(isViral);
    
    let finalImage = image;
    
    // Generate an AI image if the user didn't upload one
    if (!finalImage && text.trim()) {
      try {
        const { dataUrl } = await window.kanthinkAI.generateImage({
          prompt: `A professional, engaging promo image for a product launch described as: "${text.slice(0, 150)}". No text overlays, just a clean aesthetic visual representing the product.`
        });
        // Convert the large base64 string to a proper CDN URL so it doesn't break the 32kb kanthinkSave limit
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        const file = new File([blob], 'generated-image.png', { type: 'image/png' });
        const uploadRes = await window.kanthinkUpload(file);
        finalImage = uploadRes.url;
      } catch (err) {
        // Silently continue without image if generation fails
      }
    }

    let replies = [];
    try {
      const { json } = await window.kanthinkAI.generate({
        prompt: `Create simulated Twitter replies for this product launch post: "${text}". 
        Outcome: ${isViral ? 'VIRAL SUCCESS (hype, specific questions, excitement, celebrating the idea)' : 'FLOP / NEGATIVE (either crickets, or people heavily questioning the idea and being critical)'}.
        IMPORTANT: If an image is attached, closely analyze it. If the image is completely irrelevant to the text (like a fish for a software launch) or absurd, heavily roast or question it in the replies.
        Return ${isViral ? '6 to 10' : '0 to 3'} realistic replies. Make them hyper-specific to the product described, very dynamic, and completely different from each other. If it's a super negative flop, make them highly critical. If it goes nowhere, return 0 replies.`,
        imageUrl: finalImage || undefined,
        model: 'gemini-3.1-pro-preview',
        jsonSchema: {
          type: 'OBJECT',
          properties: {
            replies: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  name: { type: 'STRING' },
                  handle: { type: 'STRING' },
                  text: { type: 'STRING' }
                },
                required: ['name', 'handle', 'text']
              }
            }
          },
          required: ['replies']
        }
      });
      
      replies = (json?.replies || []).map(r => ({
        ...r,
        avatarColor: getRandomItem(AVATAR_COLORS),
        time: `${Math.floor(Math.random() * 23) + 1}h`
      }));
    } catch (err) {
      // Fallback comments if AI fails
      if (isViral) {
        replies = [
          { name: 'Tech Bro', handle: 'techbro99', text: 'Bro this is insane 🔥 taking my money now', avatarColor: 'bg-blue-500', time: '2h' },
          { name: 'Sarah', handle: 'sarahcodes', text: 'Congrats on the launch! Looks amazing.', avatarColor: 'bg-pink-500', time: '4h' }
        ];
      } else {
        replies = [
          { name: 'Crypto Bot', handle: 'crypto_giveaway_001', text: 'DM me for 10x returns! 🚀', avatarColor: 'bg-yellow-500', time: '1h' }
        ];
      }
    }

    const newPostData = {
      author: {
        name: 'You (Founder)',
        handle: 'founder_xyz',
        avatarColor: 'bg-indigo-600'
      },
      text,
      image: finalImage,
      isViral,
      stats,
      replies,
      timestamp: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    };

    setPostData(newPostData);
    setView('post');
  };

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    try {
      const { url } = await window.kanthinkSave(postData, 'My Product Launch Simulation');
      setShareUrl(url);
    } catch (err) {
      alert("Couldn't save link. Try again.");
    } finally {
      setIsSharing(false);
    }
  };

  const handleRestart = () => {
    setText('');
    setImage(null);
    setPostData(null);
    setShareUrl('');
    setView('composer');
  };

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 text-[#1D9BF0] animate-spin mb-6" />
        <h2 className="text-xl font-bold mb-2">Putting it out there...</h2>
        <p className="text-gray-400 text-center max-w-sm">Waiting for the algorithm to decide your fate.</p>
      </div>
    );
  }

  if (view === 'post' && postData) {
    return (
      <div className="min-h-screen bg-black text-white font-sans selection:bg-[#1D9BF0] selection:text-white pb-24">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-md flex items-center px-4 py-3 border-b border-gray-800">
          <button onClick={handleRestart} className="p-2 -ml-2 rounded-full hover:bg-gray-900 transition mr-4">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="mr-4">
            <XLogo />
          </div>
          <h1 className="text-xl font-bold">Post</h1>
        </div>

        {/* Main Post */}
        <div className="p-4">
          {/* Author Info */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${postData.author.avatarColor}`}>
                {postData.author.name[0]}
              </div>
              <div>
                <div className="font-bold hover:underline cursor-pointer flex items-center">
                  {postData.author.name}
                  <svg viewBox="0 0 24 24" className="w-4 h-4 ml-1 fill-[#1D9BF0]"><g><path d="M22.5 12.5c0-1.58-.875-2.95-2.148-3.6.154-.435.238-.905.238-1.4 0-2.21-1.71-3.998-3.918-3.998-.47 0-.92.084-1.336.25C14.818 2.415 13.51 1.5 12 1.5s-2.816.917-3.337 2.25c-.416-.165-.866-.25-1.336-.25-2.21 0-3.918 1.79-3.918 4 0 .495.084.965.238 1.4-1.273.65-2.148 2.02-2.148 3.6 0 1.46.74 2.746 1.846 3.45-.084.343-.13.7-.13 1.066 0 2.21 1.71 4 3.918 4 .622 0 1.21-.157 1.745-.426 1.02.99 2.4 1.6 3.92 1.6s2.9-.61 3.92-1.6c.536.27 1.124.426 1.746.426 2.21 0 3.918-1.79 3.918-4 0-.365-.046-.723-.13-1.066 1.107-.704 1.846-1.99 1.846-3.45zM10.87 17l-4.14-4.14 1.41-1.41L10.87 14.18l6.3-6.3 1.41 1.41L10.87 17z"></path></g></svg>
                </div>
                <div className="text-gray-500">@{postData.author.handle}</div>
              </div>
            </div>
            <MoreHorizontal className="w-5 h-5 text-gray-500" />
          </div>

          {/* Content */}
          <div className="text-[17px] leading-relaxed whitespace-pre-wrap mb-3">
            {postData.text}
          </div>
          
          {postData.image && (
            <div className="mt-3 mb-3 rounded-2xl overflow-hidden border border-gray-800">
              <img src={postData.image} alt="Post attachment" className="w-full h-auto max-h-[500px] object-cover" />
            </div>
          )}

          {/* Timestamp & Views */}
          <div className="flex flex-wrap items-center text-gray-500 text-[15px] space-x-1 py-3">
            <span>{postData.timestamp}</span>
            <span>·</span>
            <span className="font-bold text-white">{formatNumber(currentStats.views)}</span>
            <span>Views</span>
          </div>

          {/* Stats Bar */}
          <div className="flex flex-wrap items-center space-x-4 py-3 border-y border-gray-800 text-[15px]">
            <div className="flex space-x-1 cursor-pointer hover:underline">
              <span className="font-bold text-white">{formatNumber(currentStats.reposts)}</span>
              <span className="text-gray-500">Reposts</span>
            </div>
            <div className="flex space-x-1 cursor-pointer hover:underline">
              <span className="font-bold text-white">{formatNumber(Math.floor(currentStats.reposts * 0.1))}</span>
              <span className="text-gray-500">Quotes</span>
            </div>
            <div className="flex space-x-1 cursor-pointer hover:underline">
              <span className="font-bold text-white">{formatNumber(currentStats.likes)}</span>
              <span className="text-gray-500">Likes</span>
            </div>
            <div className="flex space-x-1 cursor-pointer hover:underline">
              <span className="font-bold text-white">{formatNumber(currentStats.bookmarks)}</span>
              <span className="text-gray-500">Bookmarks</span>
            </div>
          </div>

          {/* Action Bar */}
          <div className="flex justify-between py-3 border-b border-gray-800 text-gray-500 px-2">
            <button className="hover:text-[#1D9BF0] transition"><MessageCircle className="w-5 h-5" /></button>
            <button className="hover:text-green-500 transition"><Repeat className="w-5 h-5" /></button>
            <button className={`hover:text-pink-500 transition ${currentStats.likes > 0 ? 'text-pink-500 fill-pink-500' : ''}`}><Heart className="w-5 h-5" /></button>
            <button className="hover:text-[#1D9BF0] transition"><Bookmark className="w-5 h-5" /></button>
            <button className="hover:text-[#1D9BF0] transition"><Share className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Replies */}
        <div className="pb-10">
          {visibleReplies.map((reply, i) => (
            <div key={i} className="flex px-4 py-3 border-b border-gray-800 hover:bg-white/[0.03] transition cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className={`w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-lg font-bold mr-3 ${reply.avatarColor}`}>
                {reply.name[0]}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-1">
                  <span className="font-bold hover:underline">{reply.name}</span>
                  <span className="text-gray-500">@{reply.handle}</span>
                  <span className="text-gray-500">·</span>
                  <span className="text-gray-500 hover:underline">{reply.time}</span>
                </div>
                <div className="text-[15px] mt-1">
                  {reply.text}
                </div>
                <div className="flex justify-between mt-3 text-gray-500 max-w-md">
                  <button className="hover:text-[#1D9BF0] flex items-center space-x-2 text-[13px]">
                    <MessageCircle className="w-4 h-4" />
                    <span>{Math.floor(Math.random() * 5)}</span>
                  </button>
                  <button className="hover:text-green-500 flex items-center space-x-2 text-[13px]">
                    <Repeat className="w-4 h-4" />
                  </button>
                  <button className="hover:text-pink-500 flex items-center space-x-2 text-[13px]">
                    <Heart className="w-4 h-4" />
                    <span>{Math.floor(Math.random() * 50)}</span>
                  </button>
                  <button className="hover:text-[#1D9BF0]">
                    <BarChart3 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {visibleReplies.length === 0 && (
            <div className="text-center text-gray-500 py-10">
              <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
            </div>
          )}
        </div>

        {/* Floating Share Banner */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/90 backdrop-blur-lg border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm">
            <strong className="block mb-1">Simulated Outcome: {postData.isViral ? 'Viral Hit 🔥' : 'Flop 🦗'}</strong>
            <span className="text-gray-400">Share this simulation to show others what happened.</span>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            {!shareUrl ? (
              <button 
                onClick={handleShare}
                disabled={isSharing}
                className="flex-1 sm:flex-none bg-white text-black font-bold py-2 px-6 rounded-full hover:bg-gray-200 transition disabled:opacity-50 flex items-center justify-center"
              >
                {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Get Share Link'}
              </button>
            ) : (
              <div className="flex-1 sm:flex-none flex items-center bg-gray-900 rounded-full pl-4 pr-1 py-1 border border-gray-700">
                <Link2 className="w-4 h-4 text-gray-400 mr-2" />
                <input 
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="bg-transparent text-sm text-white w-full sm:w-48 outline-none"
                  onClick={(e) => e.target.select()}
                />
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="ml-2 bg-white text-black text-xs font-bold px-4 py-2 rounded-full hover:bg-gray-200 transition"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Composer View
  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {/* Composer Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 sticky top-0 bg-black/90 backdrop-blur z-10">
        <div className="flex items-center">
          <div className="p-2 -ml-2">
            <XLogo />
          </div>
        </div>
        <div className="flex space-x-4">
          <button className="font-bold text-[#1D9BF0] hover:bg-[#1D9BF0]/10 px-4 py-1.5 rounded-full transition">
            Drafts
          </button>
          <button 
            onClick={handlePost}
            disabled={!text.trim() && !image}
            className="bg-[#1D9BF0] hover:bg-[#1A8CD8] disabled:opacity-50 disabled:hover:bg-[#1D9BF0] text-white font-bold px-5 py-1.5 rounded-full transition"
          >
            Launch
          </button>
        </div>
      </div>

      {/* Composer Body */}
      <div className="p-4 flex gap-3">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-lg font-bold">
            Y
          </div>
        </div>
        <div className="flex-1 pt-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What is happening?! (Announce your launch...)"
            className="w-full bg-transparent text-xl placeholder-gray-500 outline-none resize-none min-h-[120px]"
          />
          
          {isUploading && (
            <div className="flex items-center text-[#1D9BF0] text-sm my-2">
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Uploading image...
            </div>
          )}
          
          {image && (
            <div className="relative mt-2 mb-4">
              <img src={image} alt="Upload preview" className="rounded-2xl max-h-80 w-full object-cover border border-gray-800" />
              <button 
                onClick={() => setImage(null)}
                className="absolute top-2 right-2 bg-black/70 p-1.5 rounded-full hover:bg-black/90 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Composer Toolbar */}
      <div className="fixed bottom-0 left-0 right-0 p-3 border-t border-gray-800 flex items-center bg-black">
        <label className="p-2 text-[#1D9BF0] hover:bg-[#1D9BF0]/10 rounded-full cursor-pointer transition">
          <ImageIcon className="w-5 h-5" />
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleUpload}
            disabled={isUploading}
            className="hidden" 
          />
        </label>
        {/* Fake toolbar icons for authenticity */}
        <div className="p-2 text-[#1D9BF0] hover:bg-[#1D9BF0]/10 rounded-full cursor-pointer transition opacity-50">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><g><path d="M11.96 14.945c-.067 0-.136-.01-.203-.027-1.13-.318-2.097-.986-2.795-1.932-.832-1.125-1.176-2.508-.968-3.893s.942-2.605 2.068-3.438l3.53-2.608c2.322-1.716 5.61-1.224 7.33 1.1.83 1.127 1.175 2.51.967 3.895s-.943 2.605-2.07 3.438l-1.48 1.094c-.333.246-.804.175-1.05-.158-.246-.334-.176-.804.158-1.05l1.48-1.095c.803-.592 1.327-1.463 1.476-2.45.148-.988-.098-1.975-.69-2.778-1.225-1.656-3.572-2.01-5.23-.784l-3.53 2.608c-.802.593-1.326 1.464-1.475 2.45-.15.99.097 1.975.69 2.778.498.675 1.187 1.15 1.992 1.377.4.114.633.528.52.928-.092.33-.394-.547-.722.547z"></path><path d="M7.27 22.054c-1.61 0-3.197-.735-4.225-2.125-.832-1.127-1.176-2.51-.968-3.894s.943-2.605 2.07-3.438l1.478-1.094c.334-.245.805-.175 1.05.158s.177.804-.157 1.05l-1.48 1.095c-.803.593-1.326 1.464-1.475 2.45-.148.99.097 1.975.69 2.778 1.225 1.657 3.57 2.01 5.23.785l3.528-2.608c.804-.592 1.328-1.462 1.477-2.45.148-.99-.098-1.974-.69-2.777-.498-.674-1.188-1.15-1.992-1.376-.4-.113-.633-.527-.52-.927.112-.4.528-.63.926-.522 1.13.318 2.096.986 2.794 1.932.833 1.126 1.177 2.51.968 3.895s-.942 2.605-2.068 3.438l-3.53 2.608c-.933.693-2.023 1.026-3.105 1.026z"></path></g></svg>
        </div>
      </div>
    </div>
  );
}
