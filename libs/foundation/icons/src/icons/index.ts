/**
 * Icon Registry Initialization
 *
 * Registers all available icons from lucide-react.
 * lucide-react is tree-shakeable -- only the icons explicitly imported
 * here end up in the bundle. Icons are organized by category.
 */

import {
  // Navigation
  Home,
  Menu,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Navigation,
  Navigation2,
  Compass,
  // Actions
  Search,
  Plus,
  Minus,
  Edit,
  Edit2,
  Edit3,
  Trash,
  Trash2,
  Save,
  X,
  Check,
  Copy,
  Scissors,
  Clipboard,
  ClipboardCopy,
  Download,
  Upload,
  Share,
  Share2,
  Send,
  Mail,
  MessageSquare,
  Phone,
  Video,
  Camera,
  Image,
  File,
  FileText,
  Folder,
  FolderOpen,
  Settings,
  MoreVertical,
  MoreHorizontal,
  Filter,
  SortAsc,
  SortDesc,
  // Status
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle,
  XCircle,
  HelpCircle,
  Loader2,
  Clock,
  Calendar,
  Bell,
  BellOff,
  Star,
  Heart,
  ThumbsUp,
  ThumbsDown,
  // UI
  User,
  Users,
  UserPlus,
  UserMinus,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Shield,
  Key,
  LogIn,
  LogOut,
  Cog,
  Wrench,
  Grid,
  List,
  Layout,
  Sidebar,
  PanelLeft,
  Columns,
  Rows,
  // Additional common
  RefreshCw,
  RotateCw,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  ExternalLink,
  Link,
  Bookmark,
  Tag,
  Tags,
  ShoppingCart,
  CreditCard,
  Package,
  Box,
  Archive,
  Inbox,
} from 'lucide-react';

import { registerIcon } from './registry';

/**
 * Register all icons. Called once at module load.
 */
function initializeIcons(): void {
  // Navigation
  registerIcon({ name: 'home', component: Home });
  registerIcon({ name: 'menu', component: Menu });
  registerIcon({ name: 'chevron-left', component: ChevronLeft });
  registerIcon({ name: 'chevron-right', component: ChevronRight });
  registerIcon({ name: 'chevron-up', component: ChevronUp });
  registerIcon({ name: 'chevron-down', component: ChevronDown });
  registerIcon({ name: 'arrow-left', component: ArrowLeft });
  registerIcon({ name: 'arrow-right', component: ArrowRight });
  registerIcon({ name: 'arrow-up', component: ArrowUp });
  registerIcon({ name: 'arrow-down', component: ArrowDown });
  registerIcon({ name: 'navigation', component: Navigation });
  registerIcon({ name: 'navigation-2', component: Navigation2 });
  registerIcon({ name: 'compass', component: Compass });

  // Actions
  registerIcon({ name: 'search', component: Search });
  registerIcon({ name: 'plus', component: Plus });
  registerIcon({ name: 'minus', component: Minus });
  registerIcon({ name: 'edit', component: Edit });
  registerIcon({ name: 'edit-2', component: Edit2 });
  registerIcon({ name: 'edit-3', component: Edit3 });
  registerIcon({ name: 'trash', component: Trash });
  registerIcon({ name: 'trash-2', component: Trash2 });
  registerIcon({ name: 'save', component: Save });
  registerIcon({ name: 'x', component: X });
  registerIcon({ name: 'check', component: Check });
  registerIcon({ name: 'copy', component: Copy });
  registerIcon({ name: 'scissors', component: Scissors });
  registerIcon({ name: 'clipboard', component: Clipboard });
  registerIcon({ name: 'clipboard-copy', component: ClipboardCopy });
  registerIcon({ name: 'download', component: Download });
  registerIcon({ name: 'upload', component: Upload });
  registerIcon({ name: 'share', component: Share });
  registerIcon({ name: 'share-2', component: Share2 });
  registerIcon({ name: 'send', component: Send });
  registerIcon({ name: 'mail', component: Mail });
  registerIcon({ name: 'message-square', component: MessageSquare });
  registerIcon({ name: 'phone', component: Phone });
  registerIcon({ name: 'video', component: Video });
  registerIcon({ name: 'camera', component: Camera });
  registerIcon({ name: 'image', component: Image });
  registerIcon({ name: 'file', component: File });
  registerIcon({ name: 'file-text', component: FileText });
  registerIcon({ name: 'folder', component: Folder });
  registerIcon({ name: 'folder-open', component: FolderOpen });
  registerIcon({ name: 'settings', component: Settings });
  registerIcon({ name: 'more-vertical', component: MoreVertical });
  registerIcon({ name: 'more-horizontal', component: MoreHorizontal });
  registerIcon({ name: 'filter', component: Filter });
  registerIcon({ name: 'sort-asc', component: SortAsc });
  registerIcon({ name: 'sort-desc', component: SortDesc });

  // Status
  registerIcon({ name: 'alert-circle', component: AlertCircle });
  registerIcon({ name: 'alert-triangle', component: AlertTriangle });
  registerIcon({ name: 'info', component: Info });
  registerIcon({ name: 'check-circle', component: CheckCircle });
  registerIcon({ name: 'x-circle', component: XCircle });
  registerIcon({ name: 'help-circle', component: HelpCircle });
  registerIcon({ name: 'loader-2', component: Loader2 });
  registerIcon({ name: 'clock', component: Clock });
  registerIcon({ name: 'calendar', component: Calendar });
  registerIcon({ name: 'bell', component: Bell });
  registerIcon({ name: 'bell-off', component: BellOff });
  registerIcon({ name: 'star', component: Star });
  registerIcon({ name: 'heart', component: Heart });
  registerIcon({ name: 'thumbs-up', component: ThumbsUp });
  registerIcon({ name: 'thumbs-down', component: ThumbsDown });

  // UI
  registerIcon({ name: 'user', component: User });
  registerIcon({ name: 'users', component: Users });
  registerIcon({ name: 'user-plus', component: UserPlus });
  registerIcon({ name: 'user-minus', component: UserMinus });
  registerIcon({ name: 'lock', component: Lock });
  registerIcon({ name: 'unlock', component: Unlock });
  registerIcon({ name: 'eye', component: Eye });
  registerIcon({ name: 'eye-off', component: EyeOff });
  registerIcon({ name: 'shield', component: Shield });
  registerIcon({ name: 'key', component: Key });
  registerIcon({ name: 'log-in', component: LogIn });
  registerIcon({ name: 'log-out', component: LogOut });
  registerIcon({ name: 'cog', component: Cog });
  registerIcon({ name: 'wrench', component: Wrench });
  registerIcon({ name: 'grid', component: Grid });
  registerIcon({ name: 'list', component: List });
  registerIcon({ name: 'layout', component: Layout });
  registerIcon({ name: 'sidebar', component: Sidebar });
  registerIcon({ name: 'panel-left', component: PanelLeft });
  registerIcon({ name: 'columns', component: Columns });
  registerIcon({ name: 'rows', component: Rows });

  // Additional common
  registerIcon({ name: 'refresh-cw', component: RefreshCw });
  registerIcon({ name: 'rotate-cw', component: RotateCw });
  registerIcon({ name: 'rotate-ccw', component: RotateCcw });
  registerIcon({ name: 'zoom-in', component: ZoomIn });
  registerIcon({ name: 'zoom-out', component: ZoomOut });
  registerIcon({ name: 'maximize', component: Maximize });
  registerIcon({ name: 'minimize', component: Minimize });
  registerIcon({ name: 'external-link', component: ExternalLink });
  registerIcon({ name: 'link', component: Link });
  registerIcon({ name: 'bookmark', component: Bookmark });
  registerIcon({ name: 'tag', component: Tag });
  registerIcon({ name: 'tags', component: Tags });
  registerIcon({ name: 'shopping-cart', component: ShoppingCart });
  registerIcon({ name: 'credit-card', component: CreditCard });
  registerIcon({ name: 'package', component: Package });
  registerIcon({ name: 'box', component: Box });
  registerIcon({ name: 'archive', component: Archive });
  registerIcon({ name: 'inbox', component: Inbox });
}

initializeIcons();

export * from './registry';
