export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center">
          <div className="w-12 h-12 border-3 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}
