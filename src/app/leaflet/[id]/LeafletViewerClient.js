'use client';

import React, { useCallback, useEffect, useState } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import Link from 'next/link';
import Image from 'next/image';

export default function LeafletViewerClient({ leaflet }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, skipSnaps: false });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState([]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on('select', onSelect);
  }, [emblaApi, setScrollSnaps, onSelect]);

  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);

  return (
    <div className="fixed inset-0 bg-black flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="p-4 bg-zinc-900/90 backdrop-blur-md border-b border-white/10 flex items-center justify-between z-10">
        <Link href="/" className="text-white/70 hover:text-white flex items-center gap-2">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="font-bold text-sm uppercase">Πίσω</span>
        </Link>
        <div className="text-center">
          <div className="text-white text-xs font-black uppercase tracking-widest">{leaflet.store.name}</div>
          <div className="text-white/40 text-[10px] font-bold">Λήγει: {new Date(leaflet.validUntil).toLocaleDateString('el-GR')}</div>
        </div>
        <div className="bg-white/10 px-3 py-1 rounded-full text-white text-xs font-black">
          {selectedIndex + 1} / {leaflet.pageImages.length}
        </div>
      </header>

      {/* Carousel */}
      <div className="flex-1 relative overflow-hidden" ref={emblaRef}>
        <div className="flex h-full">
          {leaflet.pageImages.map((src, idx) => (
            <div className="relative flex-[0_0_100%] h-full flex items-center justify-center p-2" key={idx}>
              <div className="relative w-full h-full">
                <Image 
                  src={src} 
                  alt={`Σελίδα ${idx + 1}`}
                  fill
                  priority={idx === 0}
                  className="object-contain"
                  sizes="100vw"
                />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Controls */}
        <button 
          onClick={scrollPrev}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md hidden md:flex items-center justify-center hover:bg-white/20 text-white"
        >
          ←
        </button>
        <button 
          onClick={scrollNext}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md hidden md:flex items-center justify-center hover:bg-white/20 text-white"
        >
          →
        </button>
      </div>

      {/* Progress Bar */}
      <div className="h-1 bg-white/5 w-full">
        <div 
          className="h-full bg-blue-500 transition-all duration-300 ease-out" 
          style={{ width: `${((selectedIndex + 1) / leaflet.pageImages.length) * 100}%` }}
        />
      </div>

      {/* Thumbnails / Footer */}
      <footer className="p-4 bg-zinc-900/90 overflow-x-auto">
        <div className="flex gap-2 justify-center">
          {scrollSnaps.map((_, index) => (
            <button
              key={index}
              onClick={() => emblaApi.scrollTo(index)}
              className={`w-2 h-2 rounded-full transition-all ${index === selectedIndex ? 'bg-blue-500 w-6' : 'bg-white/20'}`}
            />
          ))}
        </div>
      </footer>
    </div>
  );
}
