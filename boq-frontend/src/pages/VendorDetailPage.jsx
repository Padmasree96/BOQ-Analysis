import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, Building2, Calendar, User, Info, FileText, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { getMyVendors } from '../services/vendorService';
import Layout from '../components/Layout';

export default function VendorDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  useEffect(() => {
    const fetchVendor = async () => {
      if (!user?.id) return;
      setLoading(true);
      setFetchError(null);
      try {
        console.log("Fetching vendor with ID:", id, "for user:", user.id);
        
        // Use the service to get all vendors (local + remote)
        const allVendors = await getMyVendors(user.id);
        const found = allVendors.find(v => v.id === id);

        if (found) {
          console.log("Vendor found in unified list:", found);
          
          // Try to fetch extra details from Supabase if possible
          // But don't let it block the main vendor display
          try {
            const { data: detailsData } = await supabase
              .from('vendor_details')
              .select('*')
              .eq('vendor_id', id);
            
            setVendor({ ...found, vendor_details: detailsData || [] });
          } catch (e) {
            console.warn("Could not fetch extra vendor_details:", e);
            setVendor(found);
          }
        } else {
          console.log("No vendor found in unified list for ID:", id);
          setFetchError("Vendor not found in your list.");
          setVendor(null);
        }
      } catch (err) {
        console.error('Error in fetchVendor:', err);
        setFetchError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchVendor();
  }, [id]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-9 h-9 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!vendor) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto text-center py-16 bg-white rounded-3xl border border-slate-100 shadow-sm">
          <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mx-auto mb-4">
            <Building2 size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Vendor not found</h2>
          <p className="text-slate-400 mb-8 px-8">
            {fetchError || "The vendor you're looking for doesn't exist or you don't have permission to view it."}
          </p>
          <button 
            onClick={() => navigate('/vendors')} 
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition shadow-sm shadow-blue-200"
          >
            <ArrowLeft size={18} /> Back to Vendors
          </button>
        </div>
      </Layout>
    );
  }

  const initials = (vendor.company_name || vendor.name || '?')
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const details = vendor.vendor_details?.[0] || {};

  return (
    <Layout>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-2">
          <button
            onClick={() => navigate('/vendors')}
            className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 bg-white border border-slate-100 hover:bg-slate-50 transition shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-blue-200">
              {initials}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{vendor.company_name || vendor.name}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-slate-500">
                <span className="flex items-center gap-1.5 capitalize">
                  <MapPin size={14} className="text-slate-400" /> {vendor.location || 'Location missing'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-slate-400" /> Joined {new Date(vendor.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info Columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Details Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <User size={14} /> Contact Information
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <a href={`mailto:${vendor.email}`} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-white hover:ring-2 hover:ring-blue-100 transition-all group">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                    <Mail size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight mb-0.5">Email Address</p>
                    <p className="text-sm font-medium text-slate-700 truncate group-hover:text-blue-700">{vendor.email}</p>
                  </div>
                </a>
                <a href={`tel:${vendor.phone}`} className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-white hover:ring-2 hover:ring-green-100 transition-all group">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                    <Phone size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight mb-0.5">Phone Number</p>
                    <p className="text-sm font-medium text-slate-700 group-hover:text-green-700">{vendor.phone || 'Not available'}</p>
                  </div>
                </a>
              </div>
              <div className="pt-2">
                 <p className="text-xs text-slate-400 font-medium mb-1">Contact Person</p>
                 <p className="text-base text-slate-700 font-semibold">{vendor.contact_person || 'N/A'}</p>
              </div>
            </div>

            {/* Business Details Card */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <FileText size={14} /> Additional Details
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Full Address</p>
                  <p className="text-sm text-slate-700 leading-relaxed font-medium">{details.address || '—'}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">City</p>
                    <p className="text-sm text-slate-700 font-medium">{details.city || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">State</p>
                    <p className="text-sm text-slate-700 font-medium">{details.state || '—'}</p>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Pincode</p>
                  <p className="text-sm text-slate-700 font-medium">{details.pincode || '—'}</p>
                </div>
                {details.notes && (
                  <div className="space-y-1 sm:col-span-2">
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">Notes</p>
                    <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-100/50 text-slate-600 text-sm italic">
                      {details.notes}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sidebar Area */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Info size={14} /> Categories
              </h2>
              <div className="flex flex-wrap gap-2">
                {vendor.categories?.length > 0 ? (
                  vendor.categories.map(cat => (
                    <span key={cat} className="px-3 py-1.5 rounded-xl bg-slate-50 text-slate-600 text-xs font-semibold border border-slate-100 shadow-sm">
                      {cat}
                    </span>
                  ))
                ) : (
                  <p className="text-sm text-slate-400 italic">No categories assigned</p>
                )}
              </div>
            </div>
            
            <div className="bg-slate-900 p-6 rounded-2xl text-white space-y-4 shadow-xl shadow-slate-200">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Profile Status</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Verified</span>
                  <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-[10px] font-bold">YES</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-400">Trust Score</span>
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div key={i} className={`w-2 h-2 rounded-full ${i <= 4 ? 'bg-blue-400' : 'bg-slate-700'}`} />
                    ))}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => {
                  console.log("Clicked Send Quote", vendor?.id);
                  navigate(`/projects?vendorId=${vendor.id}`);
                }}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold transition"
              >
                Send Quote Request
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
